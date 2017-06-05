var curserTimeID = 0;
var message = "";
var selectLevel = 3; //default is 3, then 2, then 1
var keyboard = [
'A','B','C','D','E','F','G',
'H','I','J','K','L','M','N',
'O','P','Q','R','S','T','U',
'V','W','X','Y','Z','1','2',
'3','4','5','6','7','8','9',
'0','.',',',';',':','!','?',
'"',"'",'[',']','(',')','space','delete'];
var selectedKeys;
var pressed = 0;
var MDThreshold = 9;
var clearFlag = 0;

var ws = null;
var wsID = null;

function mini(x, y){
	if (x > y)
		return y;
	
	return x;
};

function selectKeys(keys, section, level){
	subSize = Math.pow(4,level - 1);

	newKeys = keys.slice(section*subSize, mini((section + 1)*subSize, keys.length));
	
	return newKeys;
	
};

function makeColumn(keys){
	
	var newCol0 = "";
	
	for(var i = 0; i < 4; i++){
		var newCol = "";
		var size = Math.pow(4, 2);
		var K = keys.slice(i*size, mini((i + 1)*size, keys.length));
		//console.log("K " + K.length);
		if (K.length == 2){
				newCol = newCol.concat("<div class='level2 row-lg-6'>" + K[0] + "</div>" + "<div class='level2 row-lg-6'>" + K[1] + "</div>");
				
		} else {
			for (var i2 = 0; i2 < 4; i2++){
				var newCol2 = "";
				var size2 = Math.pow(4, 1);
				var K2 = K.slice(i2*size2, mini((i2 + 1)*size2, K.length));
				//console.log("K2 " + K2.length);
				
				for (var i3 = 0; i3 < 4; i3++){
					var newCol3 = "";
					var size3 = Math.pow(4, 0);
					var K3 = K2.slice(i3*size3, mini((i3 + 1)*size3, K2.length));
					//console.log("K3 " + K3.length);
					newCol2 = newCol2.concat("<div class='level3 col-lg-3'>" + K3[0] +  "</div>");
				}
				
				
				newCol = newCol.concat("<div class='level2 row-lg-3'>" + newCol2 +  "</div>");
			}
		}
		
		newCol0 = newCol0.concat("<div class='level1 col-lg-3' id='level1-" + i + "'>" + newCol +  "</div>");
	}
	
	return newCol0;
};

function makeColumn2(keys){
	
	var newCol = "";
	
	if (keys.length == 2){
			newCol = newCol.concat("<div class='level1 col-lg-6' id='level1-" + 0 + "'>" + keys[0] + "</div>" + "<div class='level1 col-lg-6' id='level1-" + 1 + "'>" + keys[1] + "</div>");
			
	} else {
		for (var i2 = 0; i2 < 4; i2++){
			var newCol2 = "";
			var size2 = 4;
			var K2 = keys.slice(i2*size2, mini((i2 + 1)*size2, keys.length));
			//console.log("K2 " + K2.length);
			
			for (var i3 = 0; i3 < 2; i3++){
				var newCol3 = "";
				var size3 = 2;
				var K3 = K2.slice(i3*size3, mini((i3 + 1)*size3, K2.length));
				//console.log("K3 " + K3.length);
				newCol2 = newCol2.concat("<div class='level22 row-lg-6'><div class='level2 col-lg-6'>" + K3[0] + "</div>" + "<div class='level22 col-lg-6'>" + K3[1] + "</div></div>");
			}
			
			newCol = newCol.concat("<div class='level1 col-lg-3' id='level1-" + i2 + "'>" + newCol2 +  "</div>");
		}
	}
		
	
	return newCol;
};

function makeColumn3(keys){
	
	var newCol = "";
	
	if (keys.length == 2){
			newCol = newCol.concat("<div class='level1 col-lg-6'>" + keys[0] + "</div>" + "<div class='level1 col-lg-6'>" + keys[1] + "</div>");
			
	} else {
		for (var i2 = 0; i2 < 4; i2++){
			var newCol2 = "";
			var size2 = 1;
			var K2 = keys.slice(i2*size2, mini((i2 + 1)*size2, keys.length));
			//console.log("K2 " + K2.length);
			
			newCol = newCol.concat("<div class='level1 col-lg-3' id='level1-" + i2 + "'>" + K2[0] +  "</div>");
		}
	}
		
	
	return newCol;
};

function makeSliderCol(keys){
	
	var newCol = "<div id='slider-box'>";
	
	for (var i = 0; i < keys.length; i++){
		
		newCol = newCol.concat("<div class='slider-col col-lg-12' id='slider-col-" + i + "'>" + keys[i] +  "</div>");
	}
	
	return newCol.concat("</div>");
};


function cursorAnimation() {
	$('#cursor').animate({
		opacity: 0
	}, 'fast', 'swing').animate({
		opacity: 1
	}, 'fast', 'swing');
};

function type() {
	$('#message').html(message.substr(0,captionLength));
	
    
	/*$('#message').html(caption.substr(0, captionLength++));
    if(captionLength < caption.length+1) {
        setTimeout('type()', 100);
    } else {
        captionLength = 0;
        caption = '';
    }*/
};

function clearText(){
	var position = $('#message').offset();
			
	$('#cursor').hide();
	$('#displayLevel1').css({"position":"absolute", "left": position.left, "top":position.top});
	$('#displayLevel1').animate({opacity: 0}, {queue: false, duration: 170});
	$('#displayLevel1').animate({left: '+=650', top:'-=150'}, 80).animate({left: '+=360', top:'-=200'},{
								duration: 100,
								complete:function(){
									$('#cursor').show();
									$('#message').html('');
									$("#displayLevel1").css({"position":"static", "opacity": '1'});
									$("#displayLevel1").show();
								}
							});
};

function sendText(){
	$('#cursor').hide();
	$('#displayLevel1').animate({opacity: 0}, {queue: false, duration: 300});
	$("#displayLevel1").animate({"width": 'toggle'},
							{duration: 350,
							complete:function(){
								$('#cursor').show();
								$('#message').html('');
								$("#displayLevel1").css({"margin-right": '1px', "opacity": '1'});
								$("#displayLevel1").show();
							}
						});
};

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
		
			ws = null;					
			console.log("Connection is closed...");	
			alert("closed");
			window.location.href = "/";
		};
	} else {
		alert("WebSocket NOT supported");
		window.location.href = "/";
	}
};	

var processCommand = function (WSRes){
	//alert(WSRes);
	var data = JSON.parse(WSRes.data);
	console.log(WSRes.data);
	if(data.command && data.command == "stop"){
		message = "";
		selectedKeys = keyboard;
		$("#keyboard").html(makeColumn(selectedKeys));
		selectLevel = 3;
		$("#start").toggleClass('btn-default');
		ws.onmessage = null;
		$("#start").html( "Start");
			
	} else if (data.name == "MDOutput"){
		velocity = data.output;
		if(pressed == 0){
			if(velocity > MDThreshold){
				clearText();
				message = "";
				ws.send(JSON.stringify({"command":"update", "message": message})); 
				
				selectedKeys = keyboard
				$("#keyboard").html(makeColumn(selectedKeys));
				selectLevel = 3;
			} else if (velocity < -MDThreshold){
				
				ws.send(JSON.stringify({"command":"send", "message": message})); //send message value then reset it
				sendText();
				message = "";
				
				selectedKeys = keyboard
				$("#keyboard").html(makeColumn(selectedKeys));
				selectLevel = 3;
			}
		}
	} else if (data.name == "TLCOutput") {
		state = data.output;
		if (state == 0){
			if (clearFlag == 1){
				selectedKeys = keyboard
				$("#keyboard").html(makeColumn(selectedKeys));
				selectLevel = 3;
				clearFlag = 0;
			} else {
				//clear output and process key pressed, anime, if nothing press do nothing
				if(pressed != 0){
					var id = "#level1-".concat(pressed - 1);
					$(id).css({"background-color": "#FFFFFF"});
					
					if(selectLevel == 1){
						message = message.concat(selectedKeys[pressed - 1]);
						$('#message').html(message);
						
						ws.send(JSON.stringify({"command":"update", "message": message})); //send to watch
						
						selectedKeys = keyboard
						$("#keyboard").html(makeColumn(selectedKeys));
						selectLevel = 3;
						
					}else if(selectLevel == 2){
						if (selectedKeys.length == 2){
							
							if(pressed <= 2){
								if(pressed == 1){
									message = message.concat(" ");
									$('#message').html(message);
								} else if (pressed == 2){
									message = message.slice(0, -1);
								}
								
								$('#message').html(message);
								ws.send(JSON.stringify({"command":"update", "message": message})); //send to watch
								
								selectedKeys = keyboard
								$("#keyboard").html(makeColumn(selectedKeys));
								selectLevel = 3;
							}
						} else {
							selectedKeys = selectKeys(selectedKeys, pressed - 1, selectLevel);
							selectLevel -= 1;
							
							$("#keyboard").html(makeColumn3(selectedKeys));
						}
						
					}else if (selectLevel == 3) {
						selectedKeys = selectKeys(selectedKeys, pressed - 1, selectLevel);
						selectLevel -= 1;
						$("#keyboard").html(makeColumn2(selectedKeys));
						
					}
					
					pressed = 0; //simply reset the pressed value to 0
				}
			}
			
		} else {
			if(pressed == 0){
				//clear signal
				if (state == 5){ 
					for(var i = 0; i < 4; i++){
						var id = "#level1-".concat(i);
						$(id).css({"background-color": "#d9534f"});
						clearFlag = 1;
					}
				} else {
					//store key press, if another key was pressed do nothing
					var id = "#level1-".concat(state - 1);
					$(id).css({"background-color": "#337ab7"});
					pressed = state;
				}
			}
		}
	}
};

//function to activate the UI buttons
function activateUI(){
	//start button handler, tell the server to start the test scenario
	$( "#start" ).click(function() {
		selectedKeys = keyboard;
		$("#keyboard").html(makeColumn(selectedKeys));
		selectLevel = 3;
		
		$.ajax({
			type: "POST",
			url: "/realTestActivate",
			contentType: 'application/json',
			data: JSON.stringify({"ID": wsID}),
			success: function(data, status, xhr) {
				if (ws.onmessage){
					ws.onmessage = null;
					$("#start").toggleClass('btn-default');
					$("#start").html( "Start");
				} else {
					ws.onmessage = processCommand;
					$("#start").toggleClass('btn-default');
					$("#start").html( "Stop");
				}
			},
			
			error: function(xhr, status, error) {
				
				alert("Error in Real Test! Server response: " + xhr.responseText); //error ___ is still active
				window.location.href = "/";
			}
		});
	});
};

$(document).ready(function(){

	
	
	selectedKeys = keyboard
	$("#keyboard").html(makeColumn(selectedKeys));
	$("#slider").html(makeSliderCol(selectKeys(selectedKeys, 0, selectLevel)));
	
	WSConnect();
	activateUI();	

	curserTimeID = setInterval('cursorAnimation()', 600);	
	
	
	
});