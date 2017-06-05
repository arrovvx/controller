$(document).ready(function(){

	var ws = null;
	var wsID = null;
	var startTime = 0;

	refreshStatus(function(){
		activateUI();	
	});
	
	//initialize the UI interface and the service status
	function refreshStatus(callback){
		$.ajax({
			type: "POST",
			url: "/serviceStatus",
			contentType: 'application/json',
		   //data: {format: 'json'},
			success: function(data, status, xhr) {
				var data = JSON.parse(data);
				
				if(data.controllerOnline) $("#controllerStatus").css("background-color", "lightgreen");
				if(data.databaseOnline) $("#databaseStatus").css("background-color", "lightgreen");
				if(data.samplerOnline) $("#samplerStatus").css("background-color", "lightgreen");
				if(data.TLCOnline) $("#TLCStatus").css("background-color", "lightgreen");
				
				callback();			
			},
			error: function(xhr, status, error) {
				alert("Error getting service status! Server response: " + xhr.responseText);
			}
		});
	};
	
	//function called to connect to the websocket on the server end
	function WSConnect(callback){
		var serverURL = window.location.hostname;
		var wsPort = $("#WSPort").val();	

		//check if websocket is supported
		if ("WebSocket" in window) {
			
			//create connection
			ws = new WebSocket("ws://" + serverURL + ":" + wsPort + "/");

			//this function be deleted
			ws.onopen = function(){
				ws.send("diagnostic");
			};
			
			ws.onmessage = function (serverRes){
				var data = JSON.parse(serverRes.data);
				if (wsID == null) wsID = data.ID;
				ws.onmessage = null;
				callback();
			};			

			ws.onclose = function() { 
				if (counter >= 9000){ 
					$("#performance").toggleClass('btn-default');
					$("#performance").removeAttr('disabled');
					$("#result").html( "Latency: " + sum / counter+ " ms");
					$("#result").append("<br>Throughput: " + (counter* 1000) / (Math.abs(Date.now() - startTime)) + " req/s");
				}
				startTime = 0
				counter = -2;
				sum = 0;
				console.log("Connection is closed...");	
				ws = null;					
			};
		} else {
			alert("WebSocket NOT supported");
		}
	};	
	var time = Date.now();
	var time2 = window.performance.now();
	var counter = -2;
	var sum = 0;
	time = time - time2;
	//function to activate the UI buttons
	function activateUI(){
		//performance button handler, tell the server to start the performance test
		$( "#performance" ).click(function() {
		
			$("#performance").toggleClass('btn-default'); //make button disappear and have some animation saying initializing
			$("#performance").attr('disabled','disabled');
			
			startTime = Date.now();
			refreshStatus(function(){
				$.ajax({
					type: "POST",
					url: "/initPerformanceTest",
					contentType: 'application/json',
					//data: JSON.stringify({"ID": wsID}),
					success: function(data, status, xhr) {
						
						WSConnect(function startTest(){
							//change to performance display mode
							//show graphs or animation bar
							//update progress with websocket
							
							ws.onmessage = function (data){
								var time2 = window.performance.now();
								var lag = Math.abs(time2 + time - jQuery.parseJSON(data.data).timestamp) % 10;
								$("#result").html( "<div>Trip " + counter + ": " + lag + "ms</div>");
								if (counter >= 0)
									sum = sum + lag;
								counter = counter + 1;
								
							};
							
							$.ajax({
								type: "POST",
								url: "/performanceTest",
								contentType: 'application/json',
								data: JSON.stringify({"ID": wsID}),
								success: function(data, status, xhr) {
									//the server will communicate with the UI with Websocket
								},
								
								error: function(xhr, status, error) {
									alert("Error in starting performance test! Server response: " + xhr.responseText);
									ws.close();
								}
							});
						});
					},
					
					error: function(xhr, status, error) {
						alert("Error in initializing performance test! Server response: " + xhr.responseText);
					
					}
				});	
			});
		});
	};
});