var mongodb = require('mongodb');
var debug = require('debug')('dataaccess');


module.exports = function (settings){

	// load mongodb APIs and define database connection refereces
	var mongoClient = mongodb.MongoClient;
	var mongoConn = {
		URL:'mongodb://' + settings.databaseIP + ':' + settings.databasePort + '/' + settings.databaseName,
		db: null,
		collection:{
			name: null,
			signal: null,
			tmp: null
		}
	};
	
	
	var retryIntervalID = setInterval(function (err){
		mongoClient.connect(mongoConn.URL, function (err, db) {
			if (err) {
				console.log('Unable to connect to the mongodb. Error: ' + err);
			} else {
			  
				console.log('Connection established to %s', mongoConn.URL);
				clearInterval(retryIntervalID);

				mongoConn.db = db;
				mongoConn.collection.name = db.collection('signalGroups');	//unique signal id
				mongoConn.collection.signal = db.collection('signals');		//stores all signals
				mongoConn.collection.tmp = db.collection('tmp');			//tmp storage of signals
			}
		});
		
	}, settings.mongoRetryPeriod);
	
	module.isDBOnline = function (){
		return !(mongoConn.db == null);
	};
	
	module.getSignalGroupList = function(callback){
		
		mongoConn.collection.name.find({},{signalGroupName:1, signalGroupID:1}).toArray(function(err, docs) {
			if(err){
				console.log('Cannot query collection list. Error: ' + err);
				callback(err, null);
			} else {
				var signalGroupArray = [];
				docs.forEach(function(signalGroup, index){
					signalGroupArray.push({name: signalGroup.signalGroupName, ID: signalGroup.signalGroupID});
					
				});
				callback(null, signalGroupArray);
				
			}
				
		});
	};
	
	module.getSignalGroupDetails = function(signalGroupID, callback){
		
		mongoConn.collection.name.find({signalGroupID:signalGroupID},{signalGroupID:1,signalGroupName:1,channelNum:1}).toArray(function(err, docs) {
			if(err){
				console.log('Cannot query signal group. Error: ' + err);
				callback(err, null);
			} else {
			
				if (docs.length > 0){
					callback(null, docs[0]);
				} else {
					callback(null, null);
				}
			}
		});
	}
	
	module.insertNewSignalGroup = function(signalGroup, callback){
		
		mongoConn.collection.name.insert({'signalGroupName': signalGroup.signalGroupName, 'signalGroupID': signalGroup.signalGroupID, 'channelNum':signalGroup.channelVal.length}, function (err, result) {
			if (err) {
				console.log('Error creating new signal group. Error: ' + err);
				callback(err);
			} else {	
				//console.log('The documents inserted with "_id" are:', JSON.stringify(result));
				callback(null);
			}
		});
	}
	
	module.insertNewSignalTmp = function(signalInfo, outputValues, channelValues, callback){
		mongoConn.collection.tmp.insert({output: outputValues, 'input': channelValues, 'timestamp': Date.now(), 'signalGroupID': signalInfo.signalGroupID}, function (err, result) {
			if (err) {
				console.log('Cannot insert signal. Error: ' + err);
				callback(err);
				
			} else {
				//console.log('The documents inserted with "_id" are:', JSON.stringify(result));
				callback(null);
			}
		});
	}
	
	module.insertNewSignalDirectly = function(signalInfo, outputValues, channelValues, callback){
		mongoConn.collection.signal.insert({output: 1, 'input': channelValues, 'timestamp': Date.now(), 'signalGroupID': signalInfo.signalGroupID}, function (err, result) {
			if (err) {
				console.log('Cannot insert signal. Error: ' + err);
				callback(err);
				
			} else {
				//console.log('The documents inserted with "_id" are:', JSON.stringify(result));
				callback(null);
			}
		});
	}
	
	module.updateSignalGroupName = function(signalGroupInfo, callback){
		mongoConn.collection.name.update({ signalGroupID: signalGroupInfo.signalGroupID },{"$set": { "signalGroupName": signalGroupInfo.signalGroupName}},{ upsert: true });
		callback();		
	}
	
	module.saveTmpSignal = function(signalGroupInfo, callback){
		mongoConn.collection.tmp.find({ signalGroupID: signalGroupInfo.signalGroupID }).toArray(function(err, docs) {
			
			if(err){
				console.log("Error querying tmp signals. Error: " + err);
				callback(err);
			} else if (docs && docs.length > 0){
				//keep track of completed inserts
				var completeCount = 0;
				
				docs.forEach(function each(signal, index){
					mongoConn.collection.signal.insert(signal, function (err2, result) {
						
						console.log("index2 " + index);
						if (err2) {
							console.log("Cannot insert tmp signals to database. Error: " + err2);
							callback(err2);
						} else {
							//console.log('The documents inserted:', JSON.stringify(result));
							
							//keep track of complete count, wont count if error is fired
							completeCount++;	
						}
						
						//really ugly sync code
						if (docs.length == completeCount){
							callback(null);
						}
						
					});
				});
				
				//drop tmp collection, data is in docs variable
				mongoConn.collection.tmp.drop(function(error){
					console.log("Error while dropping cached signal: " + error);
				});
			} else {
				console.log("Cannot find any tmp signals");
				callback(null);
			}
			
		});
	};
	
	module.clearTmpData = function(){
		
		mongoConn.collection.name.remove( { signalGroupName: "" }, true );	//saved signalGroup must have name
		mongoConn.collection.tmp.drop(function(error){
			//strange ns not found error pops up if tmp is empty
			//console.log("Error while dropping cached signal: " + error);
		});
	};
	
	module.deleteSignalGroup = function(signalGroupInfo){
		mongoConn.collection.signal.remove( { signalGroupID: signalGroupInfo.signalGroupID }, false );
		mongoConn.collection.name.remove( { signalGroupID: signalGroupInfo.signalGroupID }, true );
	};
	
	module.addChannelToSignalGroup = function(signalGroupInfo, callback){
		mongoConn.collection.name.find({ signalGroupID: signalGroupInfo.signalGroupID }, {channelNum:1}).toArray(function(err, docs) {
				
				if(err){
					callback(err);
				} else {
					
					if(docs[0]) {
						if (docs[0].channelNum < settings.maxChannelNumber){
							mongoConn.collection.name.update({ signalGroupID: signalGroupInfo.signalGroupID },{"$set": { "channelNum": docs[0].channelNum + 1}},{ upsert: true });
							
							callback(null);
						} else {
							
							callback('Max number of channels reached');
						}
					} else {
						callback('Signal group entry does not exist');
					}
				}
				
			});
	};
	
	module.getSignals = function (signalGroupInfo, entryNum, callback){
		
		mongoConn.collection.signal.find({"signalGroupID": signalGroupInfo.signalGroupID, timestamp:{$gt: signalGroupInfo.tmpTimestamp}}).limit(entryNum).toArray(function(err, docs) {
			
			if(err){
				
				callback(err, null, null);
			} else {
				
				if(docs.length > 0){
					
					var newTmpTimestamp = docs[docs.length - 1].timestamp;
					
					docs.forEach(function each(entry) {
						callback(null, newTmpTimestamp, entry);
					});
				} else {
					
					mongoConn.collection.tmp.find({"signalGroupID": signalGroupInfo.signalGroupID, timestamp:{$gt: signalGroupInfo.tmpTimestamp}}).limit(entryNum).toArray(function(err2, docs2) {
						
						if(err){
				
							callback(err, null, null);
						} else {
							
							if(docs2.length > 0){
					
								var newTmpTimestamp = docs2[docs2.length - 1].timestamp;
								
								docs2.forEach(function each(entry) {
									callback(null, newTmpTimestamp, entry);
								});
							} else {
								
								callback(null, 0, null);
							}
						}
					});
				}
			}
			
			

		});
	};
	
	return module;
};
