var ws = require('ws').Server;
var wsClient = require('ws');
var debug = require('debug')('UI');

var ACTION_NONE = 0,
	ACTION_RECORD = 1,
	ACTION_PLAYBACK = 2,
	ACTION_TEST = 3,
	ACTION_PERFORMANCE = 4,
	ACTION_REAL_TEST = 5;

var PERFORMANCE_NONE = 0,
	PERFORMANCE_UI = 1,
	PERFORMANCE_DATABASE = 2,
	PERFORMANCE_TLC = 3;

module.exports = function (settings, dataaccess){
	
	//open websocket, this may take a while
	var WSConn = {
		UI: new ws({port:(settings.UIWebsocketPort)}),
		sampler: new ws({port:(settings.SamplerWebsocketPort)}),
		TLC: null,//new wsClient('ws://' + settings.TLCIP + ':' + settings.TLCWebsocketPort + '/')
		MD: null
	};
	
	//define server action states (sas)
	var sas = {
		schedulerID: 0,
		signalGroupName: "",
		signalGroupID: null,
		actionState: ACTION_NONE,
		performanceState:PERFORMANCE_NONE,
		UIClients: {},
		sysClientID: 1, //make this more secure
		channelVal: [],
		maxChannelNum: settings.maxChannelNumber,
		tmpTimestamp: 0,
		samplerActionFunction: null,
		TLCStateChangeID: 0,
		TLCActionState: -1,
		watchSend: 0,
		watchMessage: null,
	};
	
	WSConn.UI.on('connection', function chat(ws){
		console.log('UI client connected');
		
		//close connection if there is already a client
		if(sas.UIClients[sas.sysClientID]){
			ws.close();
			
		} else {
			
			var clientID = null;		
			clientID = sas.sysClientID;
			sas.UIClients[sas.sysClientID] = ws;	
			sas.UIClients[sas.sysClientID].send(JSON.stringify({"ID": sas.sysClientID}));	
		
			ws.on('message', function message(message){
				
		
				if(sas.actionState == ACTION_REAL_TEST){
					var data = JSON.parse(message);
					console.log(message);////
					sas.watchMessage = data.message;
					if(data.command == "send")
						sas.watchSend = 1;
					
				}
				console.log("Client message: " + message);
			});
			
			ws.on('close', function close() {
				
				delete sas.UIClients[clientID];
				dataaccess.clearTmpData();
				clearSAS();
				
				console.log('Client connection closed');
			});
		}
		
	});
	
	WSConn.sampler.on('connection', function chat(wsSample){
		console.log('Sampler client connected');
		
		wsSample.on('message', samplerDefaultHandler);
		
		wsSample.on('close', function close() {
			
			if (sas.actionState == ACTION_REAL_TEST || sas.actionState == ACTION_RECORD || sas.actionState == ACTION_TEST || sas.actionState == ACTION_PERFORMANCE){
				sas.actionState = ACTION_NONE;
				sas.samplerActionFunction = null;
				stopUIAction();
				console.log("current recording action stopped");
			}
			
			console.log("connection to sampler closed");
		});
		
	});
	/*
	WSConn.watch.on('connection', function chat(wsWatch){
		console.log('Watch client connected');
		watchClientNum += 1;
		
		wsSample.on('close', function close() {
			
			sas.watchClientNum -= 1;
			if (sas.actionState == ACTION_REAL_TEST){
				sas.actionState = ACTION_NONE;
				sas.samplerActionFunction = null;
				stopUIAction();
				console.log("current recording action stopped");
			}
			
			console.log("connection to watch closed");
		});
		
	});*/
	
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
	
	module.graph = function (req, res, next){
		
		console.log("signalgroupid in /graph " + req.body.ID);
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
	
	module.newGraph = function (req, res, next){
		
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
				sas.channelVal.push(i + 1);
				console.log("adding channels");
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
		
		res.send(JSON.stringify({"channels": sas.channelVal, "signalGroupName": sas.signalGroupName}));
	};
	
	module.getText = function(req, res, next){
		
		var command = "update";
		var msg = sas.watchMessage;
		
		if (sas.actionState != ACTION_REAL_TEST) {
			msg = "";
		}
		
		if(sas.watchSend == 1){
			command = "send";
		}
		
		sas.watchSend = 0;
		
		res.send(JSON.stringify({"command": command, "message": msg}));
	};
	
	module.realTest = function (req, res, next){
		if (sas.UIClients[sas.sysClientID]){
			res.status(500).send('System service in use');
			
		} else {
			sas.actionState = ACTION_NONE;
			
			//prepare 5 channel test
			for(var i; i < settings.realTestChannelNumber; i++)
				sas.channelVal.push(i);
			
			res.render('test', { WSPort: settings.UIWebsocketPort });
		} 
	};
	
	module.realTestActivate = function (req, res, next){
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
						useMD(function(err){
							
							if(err){
								res.status(500).send('Cannot establish connection to the Motion Detector. ' + err);
							} else {
								
								//rediret TLC message to both UI and MD
								WSConn.TLC.on('message', function(message) {
									//var TLCmsg = JSON.parse(message);
									
									//send TLC output to UI
									if(sas.UIClients[sas.sysClientID]){
										sas.UIClients[sas.sysClientID].send(message, function(err){ 
											if (err){
												console.log("Fail to send TLC data to UI. Error: " + err);
											}
										});
									}
									
									//send TLC output to MD
									if(WSConn.MD)
										WSConn.MD.send(message);
									
								});
								
								//redirect MD message to UI
								WSConn.MD.on('message', function(message) {
									//var MDmsg = JSON.parse(message);
									if(sas.UIClients[sas.sysClientID]){
										sas.UIClients[sas.sysClientID].send(message, function(err){ 
											if (err){
												console.log("Fail to send Motion Detector data to UI. Error: " + err);
											}
										});
									}
								});
								
								//redirect UI message to Watch
								/*WSConn.UI.on('message', function(message) {
									//var UImsg = JSON.parse(message);
									
									if(message.name == "text"){
										console.log("UI message: " + message);
									
										WSConn.watch.clients.forEach(function each(client) {
											client.send(message, function(err){
												
												if(err){
													console.log("Cannot send word to Watch. Error: " + err);
												}
											});
										});
									}
								});*/
								
								sas.samplerActionFunction = function (data){
									
										if(data.name == "EMG"){
											data.output = sas.TLCActionState;
											uploadEMGToTLC(data);
										}
										if(data.name == "ACC"){
											data.output = null;
											uploadACCToMD(data);
										}
								};
								
								sas.TLCActionState = 0;
								sas.TLCStateChangeID = setInterval( function(){
									sas.TLCActionState = (sas.TLCActionState + 1) % settings.TLCStateNum;
								}, settings.TLCStateChangePeriod);
								
								startSampler(); 
								sas.actionState = ACTION_REAL_TEST;
								res.send(JSON.stringify({"result": "Real Test start success"}));
							}
						});
					}
				});
				
			} else if(sas.actionState == ACTION_REAL_TEST){
				
				stopSampler();
				
				if(WSConn.TLC){
					WSConn.TLC.close();
					WSConn.TLC = null;
				}
				if(WSConn.MD){
					WSConn.MD.close();
					WSConn.MD = null;
				}
				
				clearInterval(sas.TLCStateChangeID); 
				
				sas.TLCActionState = -1;
				sas.samplerActionFunction = null;
				sas.actionState = ACTION_NONE;
				res.send(JSON.stringify({"result": "Real Test stop success"}));
			} else {
				res.status(500).send('Server resource claimed by another action');
			}
		}
	};
	
	module.record = function(req, res, next){
		var reqClientID = req.body.ID;
		
		//if no samplers are connected
		if (WSConn.sampler.clients.length == 0){
			res.status(500).send('No samplers are connected');
			
		} else if (reqClientID != sas.sysClientID){
			res.status(500).send('Error access denied');
			
		} else {
			
			if (dataaccess.isDBOnline()){
			
				if (sas.actionState == ACTION_NONE){
					
					sas.samplerActionFunction = function (data){
						if(data.name == "EMG"){
							data.output = sas.TLCActionState;
							uploadEMGToDB(data);
							sendChannelValuesToUI(data);
						}
					};
					
					//stop training timer
					sas.TLCActionState = 0;
					sas.TLCStateChangeID = setInterval( function(){
						sas.TLCActionState = (sas.TLCActionState + 1) % settings.TLCStateNum;
					}, settings.TLCStateChangePeriod);
					
					//start sampler and return success
					startSampler();
					sas.actionState = ACTION_RECORD;
					res.send(JSON.stringify({"result": "record start success"}));
				} else if(sas.actionState == ACTION_RECORD){
					stopSampler();
					clearInterval(sas.TLCStateChangeID);
				
					sas.TLCActionState = -1;
					sas.samplerActionFunction = null;
					sas.actionState = ACTION_NONE;
					res.send(JSON.stringify({"result": "record stop success"}));
				} else {
					res.status(500).send('Server resource claimed by another action');
				}
			} else {
				res.status(500).send('Cannot establish connection to the database');
			}
		}
	};
	
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
									console.log("Fail to send TLC data to UI. Error: " + err);
								}
							});
						});
						
						//setup sampler action
						sas.samplerActionFunction = function (data){
								if(data.name == "EMG"){
									data.output = sas.TLCActionState;
									uploadEMGToTLC(data);
									sendChannelValuesToUI(data);
								}
						};
						
						//stop training timer
						sas.TLCActionState = 0;
						sas.TLCStateChangeID = setInterval( function(){
							sas.TLCActionState = (sas.TLCActionState + 1) % settings.TLCStateNum;
						}, settings.TLCStateChangePeriod);
						
						//start sampler and return success
						startSampler(); 
						sas.actionState = ACTION_TEST;
						res.send(JSON.stringify({"result": "TLC dynamic learning start success"}));
					}
				});
				
			} else if(sas.actionState == ACTION_TEST){
				
				stopSampler();
				clearInterval(sas.TLCStateChangeID);
				
				sas.TLCActionState = -1;
				sas.samplerActionFunction = null;
				sas.actionState = ACTION_NONE;
				
				if(WSConn.TLC){
					WSConn.TLC.close();
					WSConn.TLC = null;
				}
				res.send(JSON.stringify({"result": "TLC dynamic learning stop success"}));
			} else {
				res.status(500).send('Server resource claimed by another action');
			}
		}
	};
	
	module.playback = function(req, res, next) {
		var reqClientID = req.body.ID;
		
		if (reqClientID != sas.sysClientID){
			res.status(500).send('Error access denied');
			
		} else if (dataaccess.isDBOnline()){
			
			if (sas.actionState == ACTION_NONE){
				
				sas.schedulerID = setInterval( playbackEMG, settings.UIDataTransferPeriod); 
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
						
						//move signal values from tmp to official
						dataaccess.saveTmpSignal(sas, function (err){
							if(err){
								res.status(500).send('Signals cannot be saved. Error' + err);
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
	
	module.cancel = function(req, res, next){
		var reqClientID = req.body.ID;
		
		if (reqClientID != sas.sysClientID){
			res.status(500).send('Error access denied');
			
		} else if (dataaccess.isDBOnline()){
			if (sas.actionState == ACTION_NONE){
				dataaccess.clearTmpData();
				clearSAS();
				
				res.send(JSON.stringify({"result": "cancel success"}));
				
			} else {
				res.status(500).send('Server resource claimed by another action');
			}
		} else {
			res.status(500).send('Cannot establish connection to the database');
		}
	};
	
	module.add = function(req, res, next){
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
						res.send(JSON.stringify({"result": "channel number update success"}));
					}
					
				});
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
				clearSAS();
				
				res.send(JSON.stringify({"result": "delete signals success"}));
				
			} else {
				res.status(500).send('Server resource claimed by another action');
			}
		} else {
			res.status(500).send('Cannot establish connection to the database');
		}
	};
	
	module.diagnostic = function(req, res, next){
		
		res.render('diagnostic', { WSPort: settings.UIWebsocketPort });
	};
	
	module.serviceStatus = function(req, res, next){
		console.log("Nodejs Server is online");
		console.log("MongoDB Server is online");
		console.log("Android Wear software is connected");
		console.log("TLC Server can not be reached. Error! Ping test failed. Server responds is: null");
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
			//check if sampler is online
			if (WSConn.sampler.clients.length > 0) {  
				
				res.send(JSON.stringify({"result": "performance started"}));
				performanceList(function(){
					
					//res.send(JSON.stringify({"result": "Performance measurements completed"}));
					
				});			
				
			} else {
				console.log('Cannot establish connection to the sampler. Access to the sampler is required.');
				res.status(500).send('Cannot establish connection to the sampler. Please reinitialize the service');
				
			}
		} 
	};
	
	function msghandler(data){
		var data = JSON.parse(data);
		
		if(data.status == "done") {
			//signal UI to stop (not done)
			console.log("Starting Performance Test");
			performanceList();
		} else {
			sas.UIClients[sas.sysClientID].send(JSON.stringify({"name" : settings.databaseName, "input": data.input, "timestamp": data.timestamp}), function(err){
				if (err) console.log("Fail to send client channel data. Error: " + err);
				
			});
		}
	};
	
	function performanceList(){
		
		if(sas.actionState == ACTION_PERFORMANCE) {
			
			if(sas.performanceState == PERFORMANCE_NONE){
				sas.performanceState = PERFORMANCE_UI;
				
				// sas.UIClients[sas.sysClientID]  send UI signal to process stuff too
				
				WSConn.sampler.clients.forEach(function each(client) {
					//set the sampler message handler
					client.removeListener('message', samplerDefaultHandler);
					client.on('message', msghandler);
						
					//start the sampler
					client.send(JSON.stringify({"command" : "startPerformance"}), function(err){
						if(err)	console.log("Cannot send start command to sampler. Error: " + err);
						
					});
				});
				
			} else if(sas.performanceState == PERFORMANCE_UI){
				sas.performanceState = PERFORMANCE_DATABASE;
				
				//check if the database is online for the database test
				if (dataaccess.isDBOnline()){
					
					performanceList();
					
				} else {
					console.log('Cannot establish connection to the database');
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
				console.log('Performance measurements completed');
				WSConn.sampler.clients.forEach(function each(client) {
					client.removeListener('message', msghandler);
					client.on('message', samplerDefaultHandler);
				});
				sas.UIClients[sas.sysClientID].close();
				//sas.UIClients[sas.sysClientID].send(JSON.stringify({"status" : "done"}));
				
			}
			
		}
	};
	
	function samplerDefaultHandler(message){
		//console.log("Data Entry: " + message);
		
		var data = JSON.parse(message);
		
		if(sas.actionState == ACTION_REAL_TEST){
			sas.samplerActionFunction(data); //didnt add test condition
			
		} else if(sas.actionState == ACTION_RECORD || sas.actionState == ACTION_TEST){
			if ( data.input && data.input.length == sas.channelVal.length ){ 
			
				sas.samplerActionFunction(data);
			} else {
				console.log("Error, data fields not properly defined");
			}
			
		} else if(data.command == "store"){
			if(dataaccess.isDBOnline()){
				if ( (data.input && data.input.length <= sas.maxChannelNum) && data.output && data.signalGroupID){
				
					//require signal ID
					signalInfo = {'signalGroupID': data.signalGroupID};
					
					dataaccess.insertNewSignalDirectly(signalInfo, data.output, data.input, function(err){
						if(err){
							ws.send(JSON.stringify({"status" : "Error"}));
						}
					});
				} else {
					console.log("Error, data fields not properly defined");
				}
			} else {
				console.log("Error inserting to database. Database not online");
				
			}
		} 
	};
	
	function clearSAS(){
		stopUIAction();
		sas.samplerActionFunction = null;
		
		if (sas.actionState != ACTION_NONE && WSConn.sampler.clients.length > 0){
			stopSampler();
		}
		
		if(WSConn.TLC){
			WSConn.TLC.close();
			WSConn.TLC = null;
		}
		if(WSConn.MD){
			WSConn.MD.close();
			WSConn.MD = null;
		}
		
		clearInterval(sas.TLCStateChangeID);
		sas.TLCActionState = -1;
		clearInterval(sas.schedulerID);
		sas.signalGroupID = null;
		sas.signalGroupName = "";
		sas.actionState = ACTION_NONE;
		sas.performanceState = PERFORMANCE_NONE;
		sas.channelVal = [];	
	};
	
	function startSampler(){
		WSConn.sampler.clients.forEach(function each(client) {
			client.send(JSON.stringify({"command" : "start"}), function(err){
				
				if(err){
					console.log("Cannot send start command to sampler. Error: " + err);
				}
			});
		});
	};
	
	function stopSampler(){
		WSConn.sampler.clients.forEach(function each(client) {
			client.send(JSON.stringify({"command" : "stop"}), function(err){
				
				if(err){
					console.log("Cannot send stop command to sampler. Error: " + err);
				}
			});
		});
	};
	
	function uploadEMGToDB(data){
		//console.log(signalGroupID);
		
		dataaccess.insertNewSignalTmp(sas, data.output, data.input, function(err){ //data.output
			
			if(err){
				console.log("Cannot insert new signal to database. Error: " + err);
			}
		});
		
	};
	
	function uploadEMGToTLC(data){
		
		WSConn.TLC.send(JSON.stringify({"name" : settings.databaseName, "input": data.input, "output":data.output, "timestamp": data.timestamp}));
	};
	
	function uploadACCToMD(data){
		
		WSConn.MD.send(JSON.stringify({"name" : "ACC", "input": data.input, "timestamp": data.timestamp}));
	};
	
	function playbackEMG(){
		
		dataaccess.getSignals(sas, 1, function(err, newTimestamp, signal){
			
			if(err){
				console.log("Cannot query signals from database for playback. Error: " + err);
			} else {
				
				sas.tmpTimestamp = newTimestamp;
				if(signal){
					sendChannelValuesToUI(signal);
					
				} else {
					console.log("No signal found for playback, replay signals");
				}
			}
		});
	};
	
	function sendChannelValuesToUI(data){
		sas.UIClients[sas.sysClientID].send(JSON.stringify({"name" : data.name, "input": data.input, "output":data.output}), function(err){ //
			//error sending websocket client  info
			if (err){
				console.log("Fail to send client channel data. Error: " + err);
				
			}
		});
		/*
		WSConn.UI.clients.forEach(function each(client) {
			client.send(JSON.stringify({"name" : settings.databaseName, "input": data.input}), function(err){ //"output":data.output
				//error sending websocket client  info
				if (err){
					console.log("Fail to send client channel data. Error: " + err);
					
				}
			});
		});*/
	};
	
	function stopUIAction(){
		if(sas.UIClients[sas.sysClientID]){
			sas.UIClients[sas.sysClientID].send(JSON.stringify({"command":"stop"}), function(err){ 
				//error sending websocket client  info
				if (err){
					console.log("Cannot send commands to UI client. Error: " + err);
					
				}
			});
		}
	};
	
	//wrapper to establish connection to the TLC websocket server and send request
	function useTLC(callback){
		
		if(WSConn.TLC){
			callback(null);
			
		} else {
			
			WSConn.TLC = new wsClient('ws://' + settings.TLCIP + ':' + settings.TLCWebsocketPort + '/');
		
			//the error or open function will be triggered initially
			WSConn.TLC.on('error', function(err) {
				
				console.log("Error with connection to the TLC. " + err);
				WSConn.TLC.close();
				WSConn.TLC = null;
				callback(err);
			});
			
			WSConn.TLC.on('open', function() {
				console.log("Connection to the TLC established");
				
				WSConn.TLC.on('error', function(err) {
					if (sas.actionState == ACTION_TEST){
						
						stopUIAction();
						stopSampler();
						clearInterval(sas.TLCStateChangeID);
						sas.TLCActionState = -1;
						sas.samplerActionFunction = null;
						sas.actionState = ACTION_NONE;
						
						console.log("current TLC test action stopped");
					} else if(sas.actionState == ACTION_REAL_TEST){
						
						stopUIAction();
						stopSampler();
						clearInterval(sas.TLCStateChangeID);
						sas.TLCActionState = -1;
						sas.samplerActionFunction = null;
						sas.actionState = ACTION_NONE;
					}
					
					WSConn.TLC.close();
					WSConn.TLC = null;
					
					console.log("Error with connection to the TLC. " + err);
				});
				
				callback(null);
			});
			
			//this will never initially be run
			WSConn.TLC.on('close', function(message) {
				if (sas.actionState == ACTION_TEST || sas.actionState == ACTION_REAL_TEST ){
					
					stopUIAction();
					if (sas.actionState != ACTION_NONE && WSConn.sampler.clients.length > 0){
						stopSampler();
					}
					clearInterval(sas.TLCStateChangeID);
					sas.TLCActionState = -1;
					sas.samplerActionFunction = null;
					sas.actionState = ACTION_NONE;
					
					console.log("current TLC test action stopped");
				}
				console.log("Connection to the TLC closed. Msg: " + message);
			});
		}
	};
	
	//wrapper to establish connection to the MD websocket server and send request
	function useMD(callback){
		
		if(WSConn.MD){
			callback(null);
			
		} else {
			
			WSConn.MD = new wsClient('ws://' + settings.MDIP + ':' + settings.MDWebsocketPort + '/');
		
			//the error or open function will be triggered initially
			WSConn.MD.on('error', function(err) {
				
				console.log("Error with connection to the Motion Detector. " + err);
				
				//clearSAS will be called handling all closings and reinitializations
				WSConn.UI.clients.forEach(function each(client) {
					clearSAS();
					client.close();
				});
				WSConn.MD.close();
				WSConn.MD = null;
				
				callback(err);
			});
			
			WSConn.MD.on('open', function() {
				console.log("Connection to the Motion Detector established");
				
				WSConn.MD.on('error', function(err) {
					if (sas.actionState == ACTION_REAL_TEST){
						//clearSAS will be called handling all closings and reinitializationsx
						clearSAS();
						WSConn.UI.clients.forEach(function each(client) {
							
							client.close();
						});
						WSConn.MD = null;
						console.log("current Motion Detector test action stopped");
					}
					
					
					console.log("Error with connection to the Motion Detector. " + err);
				});
				
				callback(null);
			});
			
			
			//this will never initially be run
			WSConn.MD.on('close', function(message) {
				if (sas.actionState == ACTION_REAL_TEST){
					
					//clearSAS will be called handling all closings and reinitializations
					clearSAS();
					WSConn.UI.clients.forEach(function each(client) {
						client.close();
					});
					WSConn.MD = null;
					
					console.log("current Motion Detector test action stopped");
				}
				
				console.log("Connection to the Motion Detector closed. Msg: " + message);
			});
		}
	};
	
	return module;
};
