var ws = require('ws').Server;
var wsClient = require('ws');
var debug = require('debug')('controller:router');

var ACTION_NONE = 0,
	ACTION_RECORD = 1,
	ACTION_PLAYBACK = 2,
	ACTION_TEST = 3,
	ACTION_PERFORMANCE = 4;

var PERFORMANCE_NONE = 0,
	PERFORMANCE_UI = 1,
	PERFORMANCE_DATABASE = 2,
	PERFORMANCE_TLC = 3;

module.exports = function (settings, dataaccess){
	
	//open websocket, this may take a while
	var WSConn = {
		UI: new ws({port:(settings.UIWebsocketPort)}),
		sampler: new ws({port:(settings.SamplerWebsocketPort)}),
		TLC: null//new wsClient('ws://' + settings.TLCIP + ':' + settings.TLCWebsocketPort + '/')
	};
	
	//define server action states (sas)
	var sas = {
		schedulerID: 0,
		signalGroupID: null,
		signalGroupName: "",
		actionState: ACTION_NONE,
		performanceState:PERFORMANCE_NONE,
		schedulerID: null,
		channelVal: [],
		UIClients: {},
		sysClientID: 1,
		maxChannelNum: settings.maxChannelNumber,
		tmpTimestamp: 0,
		samplerActionFunction: null
	};
	
	WSConn.UI.on('connection', function chat(ws){
		debug('UI client connected');
		
		//close connection if there is already a client
		if(sas.UIClients[sas.sysClientID]){
			ws.close();
			
		} else {
			
			//send access ID to UI client
			var clientID = null;		
			clientID = sas.sysClientID;
			sas.UIClients[sas.sysClientID] = ws;	
			sas.UIClients[sas.sysClientID].send(JSON.stringify({"ID": sas.sysClientID}));	
		
			ws.on('message', function message(message){
				debug("Client message: " + message);
				
			});
			
			ws.on('close', function close() {
				delete sas.UIClients[clientID];
				dataaccess.clearTmpData();
				clearSAS();
				
				debug('Client connection closed');
			});
		}
		
	});
	
	WSConn.sampler.on('connection', function chat(wsSample){
		debug('Sampler client connected');
		
		//wsSample.on('message', samplerDefaultHandler);
		
		wsSample.on('close', function close() {
			
			if (sas.actionState == ACTION_RECORD || sas.actionState == ACTION_TEST || sas.actionState == ACTION_PERFORMANCE){
				sas.actionState = ACTION_NONE;
				WSConn.sampler.removeAllListeners('message');
				stopUIAction();
				
				debug("current recording action stopped");
			}
			
			debug("connection to sampler closed");
		});
		
	});
	
	module.index = function(req, res, next){
			res.render('index');
	};
	
	module.getSignalGroups = function (req, res, next){
		if (dataaccess.isDBOnline()){
			dataaccess.getSignalGroupList(function (err, signalGroupArray){
				if(err){
					res.status(500).send('Cannot querying collection list. Error: ' + err);
				} else {
					res.send(JSON.stringify({"data":signalGroupArray}));
				}
				
			});
			
		} else {
			res.status(500).send('Cannot establish connection to the database');
		}
	};
	
	
	/* Graph Pages
	*/
	module.graph = function (req, res, next){
		
		debug("Opening signal group ID %s", req.body.ID);
		signalGroupID = parseInt(req.body.ID);
		
		if (sas.UIClients[sas.sysClientID]){
			res.status(500).send('System service in use');
			
		} else if (dataaccess.isDBOnline()){
			
			dataaccess.getSignalGroupDetails(signalGroupID, function (err, signalGroup){
				if(err){
					res.status(500).send('Cannot query specified signal in database. Error: ' + err);
					
				} else {
					if(signalGroup) {
						sas.signalGroupID = signalGroup.signalGroupID;
						sas.signalGroupName = signalGroup.signalGroupName;
						sas.actionState = ACTION_NONE;
						
						//channel array values determine the channel's UI display name
						for(i = 0; i < signalGroup.channelNum; i++)	
							sas.channelVal.push(i + 1);
						
						res.render('graph', { WSPort: settings.UIWebsocketPort });
						
					} else {
						res.status(500).send('Cannot find specified signal in database');
					}
				}
			});
			
		} else {
			res.status(500).send('Cannot establish connection to the database');
		}
	};
	
	module.graphNew = function (req, res, next){
		
		if (sas.UIClients[sas.sysClientID]){
			res.status(500).send('System service in use');
			
		} else if (dataaccess.isDBOnline()){
			
			//create new signal group profile
			sas.signalGroupID = Date.now();
			sas.signalGroupName = "";
			sas.actionState = ACTION_NONE;
			sas.channelVal.push(1)
			
			//prepare default channels
			for(i = 0; i < settings.defaultChannelNumber - 1; i++){
				sas.channelVal.push(i + 2);
				debug("adding channel %d", i + 2);
			}
			
			dataaccess.insertNewSignalGroup(sas, function (err){
				if(err) {
					res.status(500).send('Error inserting new signal group. Error: ' + err);
					
				} else {
					res.render('graph', { WSPort: settings.UIWebsocketPort });
				}
				
			});
			
		} else {
			res.status(500).send('Cannot establish connection to the database');
		}
	};
	
	module.getSignalGroupInfo = function(req, res, next){
		
		res.send(JSON.stringify({"channels": sas.channelVal, "signalGroupName": sas.signalGroupName, "renderPeriod": settings.UIRenderPeriod, "dataDisplayLength": settings.UIDataDisplayLengthe}));
	};
	
	module.record = function(req, res, next){
		var reqClientID = req.body.ID;
		
		//if no samplers are connected
		if (WSConn.sampler.clients.length == 0){
			res.status(500).send('No samplers are connected');
			
		} else if (reqClientID != sas.sysClientID){
			res.status(500).send('Error access denied');
			
		} else if (dataaccess.isDBOnline()){
			if (sas.actionState == ACTION_NONE){
				sas.samplerActionFunction = function (message){
					var data = JSON.parse(message);
					if(data.name == "audio" && data.input && data.input[0].length == sas.channelVal.length){
						uploadDataToDB(data);
						uploadMessageToUI(message);
					} else {
						debug("Error, data fields not properly defined");
					}
				};
				
				//start sampler and return success
				setSamplerHandler(sas.samplerActionFunction);
				startSampler();
				sas.actionState = ACTION_RECORD;
				res.send(JSON.stringify({"result": "record start success"}));
				
			} else if(sas.actionState == ACTION_RECORD){
				stopSampler();
				removeSamplerHandlers();
				sas.actionState = ACTION_NONE;
				res.send(JSON.stringify({"result": "record stop success"}));
				
			} else {
				res.status(500).send('Server resource claimed by another action');
			}
		} else {
			res.status(500).send('Cannot establish connection to the database');
		}
	};
	
	module.playback = function(req, res, next) {
		var reqClientID = req.body.ID;
		
		if (reqClientID != sas.sysClientID){
			res.status(500).send('Error access denied');
			
		} else if (dataaccess.isDBOnline()){
			if (sas.actionState == ACTION_NONE){
				
				sas.schedulerID = setInterval( playbackRecordings, settings.UIDataTransferPeriod); 
				sas.actionState = ACTION_PLAYBACK;
				res.send(JSON.stringify({"result": "playback start success"}));
				
			} else if(sas.actionState == ACTION_PLAYBACK){
				clearInterval(sas.schedulerID);
				sas.actionState = ACTION_NONE;
				res.send(JSON.stringify({"result": "playback stop success"}));
				
			} else {
				res.status(500).send('Server resource claimed by another action');
			}
			
		} else {
			res.status(500).send('Cannot establish connection to the database');
		}
	}
	
	module.testTLC = function(req, res, next){
		var reqClientID = req.body.ID;
		
		//if no samplers are connected
		if (WSConn.sampler.clients.length == 0){
			res.status(500).send('No samplers are connected');
			
		} else if (reqClientID != sas.sysClientID){
			res.status(500).send('Error access denied');
			
		} else {
			if (sas.actionState == ACTION_NONE){
				useTLC(function(err){
					if(err){
						res.status(500).send('Cannot establish connection to the TLC. ' + err);

					} else {
						//redirect TLC output to UI
						WSConn.TLC.on('message', function(message) {
							var TLCmsg = JSON.parse(message);
							//send TLC output to UI
							sas.UIClients[sas.sysClientID].send(JSON.stringify({"name" : "TLCOutput", "output": TLCmsg.output}), function(err){ 
								if (err){
									debug("Fail to send TLC data to UI. Error: " + err);
								}
							});
						});
						
						//setup sampler action
						sas.samplerActionFunction = function (message){
								var data = JSON.parse(message);
								if(data.name == "audio" && data.input && data.input[0].length == sas.channelVal.length){
									uploadMessageToTLC(message);
									uploadMessageToUI(message);
								} else {
									debug("Error, data fields not properly defined");
								}
						};
						
						//start sampler and return success
						setSamplerHandler(sas.samplerActionFunction);
						startSampler();
						sas.actionState = ACTION_TEST;
						res.send(JSON.stringify({"result": "TLC dynamic learning start success"}));
					}
				});
				
			} else if(sas.actionState == ACTION_TEST){
				removeSamplerHandlers();
				stopSampler();
				sas.actionState = ACTION_NONE;
				res.send(JSON.stringify({"result": "TLC dynamic learning stop success"}));
				
			} else {
				res.status(500).send('Server resource claimed by another action');
			}
		}
	};
	
	module.save = function(req, res, next){
		var newSignalGroupName = req.body.signalGroupName;
		var reqClientID = req.body.ID;
		
		if (reqClientID != sas.sysClientID){
			res.status(500).send('Error access denied');
			
		} else if (dataaccess.isDBOnline()){
			if (sas.actionState == ACTION_NONE){
				if (newSignalGroupName){
					//update signal name 
					sas.signalGroupName = newSignalGroupName;
					dataaccess.updateSignalGroupName(sas, function(){
						//move signal values from tmp to official repo
						dataaccess.saveTmpSignal(sas, function (err){
							if(err){
								res.status(500).send('Signals cannot be saved. Error: ' + err);
							} else {
								res.send(JSON.stringify({"result": "save signals success"}));
							}
						});
					});
					
				} else {
					res.status(500).send('Signal name cannot be empty');
				}
				
			} else {
				res.status(500).send('Server resource claimed by another action');
			}
			
		} else {
			res.status(500).send('Cannot establish connection to the database');
		}
	};
	
	module.clearTmpData = function(req, res, next){
		var reqClientID = req.body.ID;
		
		if (reqClientID != sas.sysClientID){
			res.status(500).send('Error access denied');
			
		} else if (dataaccess.isDBOnline()){
			if (sas.actionState == ACTION_NONE){
				dataaccess.clearTmpData();
				res.send(JSON.stringify({"result": "clear temporary data success"}));
				
			} else {
				res.status(500).send('Server resource claimed by another action');
			}
		} else {
			res.status(500).send('Cannot establish connection to the database');
		}
	};
	
	module.deleteSignalGroup = function(req, res, next){
		var reqClientID = req.body.ID;
		
		if (reqClientID != sas.sysClientID){
			res.status(500).send('Error access denied');
			
		} else if (dataaccess.isDBOnline()){
			if (sas.actionState == ACTION_NONE){
				dataaccess.deleteSignalGroup(sas);				
				dataaccess.clearTmpData();
				res.send(JSON.stringify({"result": "delete signals success"}));
				
			} else {
				res.status(500).send('Server resource claimed by another action');
			}
		} else {
			res.status(500).send('Cannot establish connection to the database');
		}
	};
	
	module.addChannel = function(req, res, next){
		var reqClientID = req.body.ID;
		
		if (reqClientID != sas.sysClientID){
			res.status(500).send('Error access denied');
			
		} else if (dataaccess.isDBOnline()){
			if (sas.actionState == ACTION_NONE){
				dataaccess.addChannelToSignalGroup(sas, function (err){
					if(err){
						res.status(500).send("Cannot update channel number. Error: " + err);
						
					} else {
						sas.channelVal.push(0);
						res.send(JSON.stringify({"result": "channel add number update success"}));
					}
				});
				
			} else {
				res.status(500).send('Server resource claimed by another action');
			}
		} else {
			res.status(500).send('Cannot establish connection to the database');
		}
	};
	
	module.subtractChannel = function(req, res, next){
		var reqClientID = req.body.ID;
		
		if (reqClientID != sas.sysClientID){
			res.status(500).send('Error access denied');
			
		} else if (dataaccess.isDBOnline()){
			if (sas.actionState == ACTION_NONE){
				dataaccess.subtractChannelToSignalGroup(sas, function (err){
					if(err){
						res.status(500).send("Cannot update channel number. Error: " + err);
						
					} else {
						sas.channelVal.pop();
						res.send(JSON.stringify({"result": "channel subtract number update success"}));
					}
				});
				
			} else {
				res.status(500).send('Server resource claimed by another action');
			}
		} else {
			res.status(500).send('Cannot establish connection to the database');
		}
	};
	
	
	/* Performance Pages
	*/
	module.diagnostic = function(req, res, next){
		
		res.render('diagnostic', { WSPort: settings.UIWebsocketPort });
	};
	
	module.serviceStatus = function(req, res, next){
		
		debug("Nodejs Server is online");
		
		if (dataaccess.isDBOnline())
			debug("MongoDB Server is online");
		else
			debug("MongoDB Server is offline");
		
		if (WSConn.sampler.clients.length > 0)
			debug("Sampler is online");
		else
			debug("Sampler is offline");
		
		if(Boolean(WSConn.TLC))
			debug("TLC Server is online");
		else 
			debug("TLC Server can not be reached. Error! Ping test failed. Server responds is: null");
		
		res.send(JSON.stringify({"controllerOnline": true, "databaseOnline": dataaccess.isDBOnline(), "samplerOnline": WSConn.sampler.clients.length > 0, "TLCOnline": Boolean(WSConn.TLC)}));
	};
	
	module.initPerformanceTest = function(req, res, next){
		
		if (sas.actionState == ACTION_PERFORMANCE){
			res.status(500).send('Performance measurement in progress');
			
		} else {
			if(sas.UIClients[sas.sysClientID]){
				//the WS close function will reset SAS and service values, and switch to performance mode
				sas.UIClients[sas.sysClientID].close();
			}
			
			sas.actionState = ACTION_PERFORMANCE;
		}
		
		res.send(JSON.stringify({"result": "Server services reinitialized"}));
	};
	
	module.performanceTest = function(req, res, next){
		
		var reqClientID = req.body.ID;
		
		if (reqClientID != sas.sysClientID){
			res.status(500).send('Error access denied');
			
		} else if(sas.actionState != ACTION_PERFORMANCE){
			res.status(500).send('Error starting performance error. Please reinitialize the service');
			
		} else {
			//if no samplers are connected
			if (WSConn.sampler.clients.length == 0){
				debug('Cannot establish connection to the sampler. Access to the sampler is required.');
				res.status(500).send('Cannot establish connection to the sampler. Please reinitialize the service');
				
			} else {  
				res.send(JSON.stringify({"result": "performance started"}));
				performanceList(function(){
					//res.send(JSON.stringify({"result": "Performance measurements completed"}));
				});			
				
			}
		} 
	};
	
	function performanceList(){
		if(sas.actionState == ACTION_PERFORMANCE) {
			if(sas.performanceState == PERFORMANCE_NONE){
				sas.performanceState = PERFORMANCE_UI;
				
				var msghandler = function(message){
					var data = JSON.parse(message);
					
					if(data.status == "done") {
						//signal UI to stop (not done)
						debug("Starting Performance Test");
						performanceList();
						
					} else {
						sas.UIClients[sas.sysClientID].send(JSON.stringify({"name" : settings.databaseName, "input": data.input, "timestamp": data.timestamp}), function(err){
							if (err) debug("Fail to send client channel data. Error: " + err);
							
						});
					}
				};
				removeSamplerHandlers();
				setSamplerHandler(msghandler);
				
				for (var i = 0, len = WSConn.sampler.clients.length; i < len; i++) {
					WSConn.sampler.clients[i].send(JSON.stringify({"command" : "startPerformance"}), function(err){
						if(err){
							debug("Cannot send performance start command to sampler. Error: " + err);
						}
					});
				}
				
			} else if(sas.performanceState == PERFORMANCE_UI){
				sas.performanceState = PERFORMANCE_DATABASE;
				
				//check if the database is online for the database test
				if (dataaccess.isDBOnline()){
					performanceList();
					
				} else {
					debug('Cannot establish connection to the database');
					performanceList();
				}
				
			} else if (sas.performanceState == PERFORMANCE_DATABASE){
				sas.performanceState = PERFORMANCE_TLC;
				performanceList();
				
				/*
				if (){ //check if TLC is online
				
				} else {
					console.log('Cannot establish connection to the TLC');
					performanceList();
				}*/
				
			} else if (sas.performanceState == PERFORMANCE_TLC){
				removeSamplerHandlers()
				sas.UIClients[sas.sysClientID].close();
				sas.actionState = ACTION_NONE;
				sas.performanceState = PERFORMANCE_NONE;
				
				debug('Performance measurements completed');
			}
		}
	};
	
	function clearSAS(){
		WSConn.sampler.removeAllListeners('message');
						//sas.samplerActionFunction = null;
		
		stopSampler();
		stopUIAction();
		
		if(WSConn.TLC){
			WSConn.TLC.close();
			WSConn.TLC = null;
		}
		
		clearInterval(sas.schedulerID);
		sas.signalGroupID = null;
		sas.signalGroupName = "";
		sas.actionState = ACTION_NONE;
		sas.channelVal = [];	
		
		sas.performanceState = PERFORMANCE_NONE;
	};
	
	function playbackRecordings(){
		dataaccess.getSignals(sas, 1, function(err, newTimestamp, signal){
			if(err){
				debug("Cannot query signals from database for playback. Error: " + err);
				
			} else {
				sas.tmpTimestamp = newTimestamp;
				if(signal){
					uploadMessageToUI(signal);
					
				} else {
					debug("No signal found for playback, replay signals");
				}
			}
		});
	};
	
	function removeSamplerHandlers(){
		for (var i = 0, len = WSConn.sampler.clients.length; i < len; i++) {
			WSConn.sampler.clients[i].removeAllListeners('message');
			//WSConn.sampler.clients.forEach(function each(client) {
			//	client.removeListener('message', samplerDefaultHandler);
		}
	};
	
	function setSamplerHandler(handler){
		for (var i = 0, len = WSConn.sampler.clients.length; i < len; i++) {
			WSConn.sampler.clients[i].on('message', handler);
		}
	};
	
	function startSampler(){
		for (var i = 0, len = WSConn.sampler.clients.length; i < len; i++) {
			WSConn.sampler.clients[i].send(JSON.stringify({"command" : "start"}), function(err){
				
				if(err){
					debug("Cannot send start command to sampler. Error: " + err);
				}
			});
		}
	};
	
	function stopSampler(){
		for (var i = 0, len = WSConn.sampler.clients.length; i < len; i++) {
			WSConn.sampler.clients[i].send(JSON.stringify({"command" : "stop"}), function(err){
				
				if(err){
					debug("Cannot send stop command to sampler. Error: " + err);
				}
			});
		}
	};
	
	function stopUIAction(){
		if(sas.UIClients[sas.sysClientID]){
			sas.UIClients[sas.sysClientID].send(JSON.stringify({"command":"stop"}), function(err){ 
				//error sending websocket client  info
				if (err){
					debug("Cannot send commands to UI client. Error: " + err);
				}
			});
		}
	};
	
	function uploadDataToDB(data){
		//console.log(signalGroupID);
		
		dataaccess.insertNewSignalTmp(sas, data.output, data.input, function(err){ //data.output
			
			if(err){
				debug("Cannot insert new signal to database. Error: " + err);
			}
		});
		
	};
	
	function uploadMessageToTLC(message){
		
		WSConn.TLC.send(message);
	};
	
	function uploadMessageToUI(message){
		sas.UIClients[sas.sysClientID].send(message, function(err){ //
			//error sending websocket client  info
			if (err){
				debug("Fail to send client channel data. Error: " + err);
				
			}
		});
	};
	
	//wrapper to establish connection to the TLC websocket server and send request
	function useTLC(callback){
		
		if(WSConn.TLC){
			callback(null);	//null means connection is open
			
		} else {
			WSConn.TLC = new wsClient('ws://' + settings.TLCIP + ':' + settings.TLCWebsocketPort + '/');
		
			//the error or open function will be triggered initially
			WSConn.TLC.on('error', function(err) {
				debug("Error with connection to the TLC. " + err);
				WSConn.TLC.close();
				WSConn.TLC = null;
				callback(err);
				
			});
			
			WSConn.TLC.on('open', function() {
				debug("Connection to the TLC established");
				
				WSConn.TLC.on('error', function(err) {
					if (sas.actionState == ACTION_TEST){
						WSConn.sampler.removeAllListeners('message');
						stopSampler();
						stopUIAction();
						sas.actionState = ACTION_NONE;
						
						debug("current TLC test action stopped");
					} 
					
					WSConn.TLC.close();
					WSConn.TLC = null;
					
					debug("Error with connection to the TLC. " + err);
				});
				
				WSConn.TLC.on('close', function(message) {
					if (sas.actionState == ACTION_TEST ){
						WSConn.sampler.removeAllListeners('message');
						stopSampler();
						stopUIAction();
						sas.actionState = ACTION_NONE;
						
						debug("current TLC test action stopped");
					}
					
					debug("Connection to the TLC closed. Msg: " + message);
				});
				
				callback(null);
			});
		}
	};
	
	return module;
};
