$(document).ready(function(){

	var ws = null;
	var wsID = null;
	var defaultValue = 0;				//default initial value for the plots, delete this if its not necessary

	var plotStates = [];
	var dataDisplayLength = 4000; 		//number of points visible on the charts
	var channelNum = 0;					//store the number of channels currently in display
	var renderPeriod = 100;				//the graph will update its display every render second
	
	var schedulerID = 0;				//used to schedule timing events
	var actionState = null;

	//initialize the UI variables and interface
	$.ajax({
		type: "POST",
		url: "/getSignalGroupInfo",
		contentType: 'application/json',
	   //data: {format: 'json'},
		success: function(message, status, xhr) {
			var data = JSON.parse(message);
			var signalGroupName = data.signalGroupName;
			var channels = data.channels;
			renderPeriod = data.renderPeriod;
			dataDisplayLength = data.dataDisplayLength;
			
			$("#signalGroupName").val(signalGroupName);
			
			channels.forEach( function(channel, index){
				//alert(JSON.stringify(createPlotState("EMG" + channel)));
				channelNum++;
				
				$("#graphTable").append('<div class="col-md-6"><div id="' + "CH-" + channelNum + '" style="height: 250px;"></div></div>');	
				
				var state = createPlotState("CH-" + channelNum);
				
				plotStates.push(state);
				updatePlot(state, defaultValue);
				state.chart.render();
			});
			
			WSConnect();
			activateUI();			
		},
		error: function(xhr, status, error) {
			alert("Error getting max channel number! Server response: " + xhr.responseText);
			window.location.href = "/";
		}
	});
	
	
	//called on every server response to update the plot's internal values
	var plotWSRes = function (WSRes){
		//alert(WSRes);
		var data = JSON.parse(WSRes.data);
		
		if(data.command == "stop"){
			clearActions();
			
		} else {
			var values = data.input;
			
			for (var i = 0, len = plotStates.length; i < len; i++) {
				updatePlot(plotStates[i], values[i]);
			}

			//debugging purposes
			//var messageBox = document.getElementById("messageBox");
			//messageBox.innerHTML += "<div>Channel Values: "+values.toString()+"\n"+"</div>";
		}
	};

	//this function updates the plot display
	var renderPlots = function(){

		plotStates.forEach(function each(state, index){
			state.chart.render();
		});
	};

	//this function initialize the plot to a default value for viewing between different actions
	function initializePlot(){

		plotStates.forEach(function each(state, index){
			for(i = 0; i < dataDisplayLength / 2;i++)
				updatePlot(state, defaultValue);
			state.chart.render();
		});
	};

	//this function creates a new state for a new plot
	function createPlotState(plotName){

		//number of datapoints to be displayed
		var plotState = {};
		
		plotState.dps = []; 			//data points value array
		plotState.xVal = 0;		  		//the x value axis of the chart
		
		//create the chart to be displayed using canvasJS
		plotState.chart = new CanvasJS.Chart(plotName,{
			title :{
				text: plotName
			},			
			data: [{
				type: "line",
				dataPoints: plotState.dps 
			}],
			zoomEnabled:true
		});
		
		return plotState;
	}

	//this function updates the array that stores the plotted points in each plot (this does not update the display)
	var updatePlot = function (plotState, yVal) {

		plotState.dps.push({
			x: plotState.xVal,
			y: yVal
		});
		plotState.xVal++;
		
		if (plotState.dps.length > dataDisplayLength)
			plotState.dps.shift();
		
	};
	
	function isOtherActionActive(newActionName){
		if(actionState){
			if(actionState == newActionName){
				actionState = null;
				return false;
				
			} else {
				return true;
			}
			
		} else {
			actionState = newActionName;
			return false;
		}
	};
	
	function clearActions(){
		//make sure button is pressed up
		if(actionState){
			if (!$("#" + actionState).hasClass('btn-default'))
				$("#" + actionState).toggleClass('btn-default');
			actionState = null;
		}
		
		//end the actions
		clearInterval(schedulerID);
		ws.onmessage = null;	
	}

	//optimize this
	//function called to connect to the websocket on the server end
	function WSConnect(){
		var serverURL = window.location.hostname;
		var serverPort = window.location.port;
		var wsPort = $("#WSPort").val();	

		//check if websocket is supported
		if ("WebSocket" in window) {
			//create connection
			ws = new WebSocket("ws://" + serverURL + ":" + wsPort + "/");

			//this function be deleted
			ws.onopen = function(){
				ws.send("Notice me senpai");
			};
			
			ws.onmessage = function (serverRes){
				var data = JSON.parse(serverRes.data);
				if (wsID == null) wsID = data.ID;
				ws.onmessage = null;
				
			};			

			ws.onclose = function() { 
				clearActions();
				ws = null;					
				console.log("Connection is closed...");	
				
			};
		} else {
			alert("WebSocket NOT supported");
		}
	};	
	
	//function to activate the UI buttons
	function activateUI(){
		//record button handler, tell the server to start recording
		$( "#record" ).click(function() {
			//check if the an action is already activated
			if(isOtherActionActive("record")){
				alert("Error! Please stop the other actions before performing this one");
				return null;
			}
		
			$("#record").toggleClass('btn-default');
			
			$.ajax({
				type: "POST",
				url: "/record",
				contentType: 'application/json',
				data: JSON.stringify({"ID": wsID}),
				success: function(data, status, xhr) {
					
					if (ws.onmessage){
						ws.onmessage = null;
						clearInterval(schedulerID);
					} else {
						ws.onmessage = plotWSRes;
						schedulerID = setInterval( renderPlots, renderPeriod);
					}
				},
				
				error: function(xhr, status, error) {
					clearActions();
					alert("Error in recording! Server response: " + xhr.responseText); //error ___ is still active
				}
			});
		});
		
		//result button handler, tell the server to load samples to test the AI result
		$( "#test" ).click(function() {
			//check if the an action is already activated
			if(isOtherActionActive("test")){
				alert("Error! Please stop the other actions before performing this one");
				return null;
			}
		
			$("#test").toggleClass('btn-default');
			
			$.ajax({
				type: "POST",
				url: "/test",
				contentType: 'application/json',
				data: JSON.stringify({"ID": wsID}),
				success: function(data, status, xhr) {
					if (ws.onmessage){
						ws.onmessage = null;
						clearInterval(schedulerID);
					} else {
						ws.onmessage = plotWSRes;
						schedulerID = setInterval( renderPlots, renderPeriod); 
					}
				},
				
				error: function(xhr, status, error) {
					clearActions();
					alert("Error in testing! Server response: " + xhr.responseText); //error ___ is still active
				}
			});
		});
		
		//playback button handler, tell the server to play the recorded signals back to the UI
		$( "#playback" ).click(function() {
			//check if the an action is already activated
			if(isOtherActionActive("playback")){
				alert("Error! Please stop the other actions before performing this one");
				return null;
			}
		
			$("#playback").toggleClass('btn-default');
			
			$.ajax({
				type: "POST",
				url: "/playback",
				contentType: 'application/json',
				data: JSON.stringify({"ID": wsID}),
				success: function(data, status, xhr) {
					if (ws.onmessage){
						ws.onmessage = null;
						clearInterval(schedulerID);
					} else {
						//initializePlot();
						ws.onmessage = plotWSRes;
						schedulerID = setInterval( renderPlots, renderPeriod); 
					}
				},
				
				error: function(xhr, status, error) {
					clearActions();
					alert("Error in playback! Server response: " + xhr.responseText); //error ___ is still active
				}
			});
		});
		
		//save button handler, tell the server to save the currently recorded signal group and it's attributes 
		$( "#save" ).click(function() {
			//check if the an action is already activated
			if(isOtherActionActive("save")){
				alert("Error! Please stop the other actions before performing this one");
				return null;
			}
		
			$("#save").toggleClass('btn-default');
			//alert($("#signalGroupName").val());
			var signal2 = {signalGroupName: $("#signalGroupName").val(), "ID": wsID};
			
			$.ajax({
				type: "POST",
				url: "/save",
				contentType: 'application/json',
				data: JSON.stringify(signal2),
				success: function(data, status, xhr) {
					window.location.href = "/";
				},
				
				error: function(xhr, status, error) {
					clearActions();
					alert("Error in save! Server response: " + xhr.responseText); //error ___ is still active
				}
			});
		});
		
		//cancel, button handler, tell ther server to cancel all request performed for this session
		$( "#cancel" ).click(function() {
			//check if the an action is already activated
			if(isOtherActionActive("cancel")){
				alert("Error! Please stop the other actions before performing this one");
				return null;
			}
		
			$("#cancel").toggleClass('btn-default');
			
			$.ajax({
				type: "POST",
				url: "/clear",
				contentType: 'application/json',
				data: JSON.stringify({"ID": wsID}),
				success: function(data, status, xhr) {
					window.location.href = "/";
				},
				
				error: function(xhr, status, error) {
					clearActions();
					alert("Error in cancel! Server response: " + xhr.responseText); //error ___ is still active
				}
			});
		});
		
		//delete button handler, tell the server to delete the currently selected signal group
		$( "#delete" ).click(function() {
			//check if the an action is already activated
			if(isOtherActionActive("delete")){
				alert("Error! Please stop the other actions before performing this one");
				return null;
			}
		
			$("#delete").toggleClass('btn-default');
			
			$.ajax({
				type: "POST",
				url: "/delete",
				contentType: 'application/json',
				data: JSON.stringify({"ID": wsID}),
				success: function(data, status, xhr) {
					window.location.href = "/";
				},
				
				error: function(xhr, status, error) {
					clearActions();
					alert("Error in save! Server response: " + xhr.responseText);
				}
			});
		});
		
		//add button handler, tell the server to add a new channel to this signal group
		$( "#add" ).click(function() {
			//check if the an action is already activated
			if(isOtherActionActive("add")){
				alert("Error! Please stop the other actions before performing this one");
				return null;
			}
		
			//$("#add").toggleClass('btn-default');

			
			$.ajax({
				type: "POST",
				url: "/add",
				contentType: 'application/json',
				data: JSON.stringify({"ID": wsID}),
				success: function(data, status, xhr) {
					console.log("add: ", channelNum);
					channelNum++;
					console.log("add: ", channelNum);
					$("#graphTable").append('<div class="col-md-6"><div id="' + "CH-" + channelNum + '" style="height: 250px;"></div></div>');
					
					var newState = createPlotState("CH-" + channelNum);
							
					plotStates.push(newState);
					updatePlot(newState, defaultValue);
					plotStates[0].chart.render();
					newState.chart.render();
					isOtherActionActive("add");
					//alert("qwe333" + plotStates.toString());
					//$("#add").toggleClass('btn-default');
				},
				
				error: function(xhr, status, error) {
					clearActions();
					alert("Error in add! Server response: " + xhr.responseText);
				}
			});
		});
		
		//subtract button handler, tell the server to subtract a new channel to this signal group
		$( "#subtract" ).click(function() {
			//check if the an action is already activated
			if(isOtherActionActive("subtract")){
				alert("Error! Please stop the other actions before performing this one");
				return null;
			}
		
			//$("#add").toggleClass('btn-default');

			
			$.ajax({
				type: "POST",
				url: "/subtract",
				contentType: 'application/json',
				data: JSON.stringify({"ID": wsID}),
				success: function(data, status, xhr) {
					var lastChannel = document.getElementById("CH-" + channelNum).parentNode;
					lastChannel.remove();
					
					channelNum--;
					plotStates.pop();
					isOtherActionActive("subtract");
				},
				
				error: function(xhr, status, error) {
					clearActions();
					alert("Error in add! Server response: " + xhr.responseText);
				}
			});
		});
	};
});