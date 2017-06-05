$(document).ready(function(){
	
	$.ajax({
		type: "POST",
		url: "getSignalGroups",
		contentType: 'application/json',
	   //data: {format: 'json'},
		success: function(data, status, xhr) {
			var signalGroups = JSON.parse(data).data;
			
			signalGroups.forEach( function(signalGroup, index){
				//only new signal groups in used should have no signal group name
				if (!signalGroup.name){
					signalGroup.name = "(Currently In Use)";
				}
				
				var newButton = "<div class='row menu-row'>"
				+	"<div class='menu-col'><form action='/graph' method='post'>"
				+		"<input type='hidden' name='ID' value='" + signalGroup.ID + "'>"
				+		"<button class='btn btn-primary btn-lg btn-block signalBtn' type='submit'>" + signalGroup.name + "</button>"
				+	"</form></div>"
				+"</div>";
				
				$("#signal-menu").prepend(newButton);
			});
		},
		error: function(xhr, status, error) {
			alert("Error! Server response: " + xhr.responseText);
		}
	});
});