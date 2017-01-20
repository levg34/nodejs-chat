var port = ''
if (location.hostname=='localhost') {
	if (location.port!=''&&location.port!='80')
	port=':'+location.port
} else {
	port=':8000'
}
// connect to socket.io
var socket = io.connect('http://'+location.hostname+port)

// ask for nickname, send to server and display in the title
var nickname = prompt('Enter your nickname.')
socket.emit('new_client', nickname)
var title=document.title
document.title = nickname + ' - ' + title

var list = []

// if server requests a change in the nickname
socket.on('set_nickname', function(new_nickname){
	nickname = new_nickname
	document.title = nickname + ' - ' + title
	messageFromServer('your nickname has been changed to <b>' + nickname + '</b> by server.')
})

// insert message in page upon reception
socket.on('message', function(data) {
	insertMessage(data.nickname, data.message, data.time)
})

// display info when a new client joins
socket.on('new_client', function(nickname) {
	messageFromServer(nickname + ' joined in.')
	addToList(nickname)
})

// display info when a client lefts
socket.on('client_left', function(nickname) {
	messageFromServer(nickname + ' left the chat.')
	removeFromList(nickname)
})

// list of connected clients
socket.on('list', function(list) {
	setupList(list)
})

// submit form, send message and diplay it on th page
function send() {
	var message = $('#message').val()
	if (message!='') {
		// send message to others
		socket.emit('message', message)
		// display message in our page as well
		var date = new Date()
		var hours = date.getHours()
		if (hours<10) {
			hours = '0'+hours
		}
		var minutes = date.getMinutes()
		if (minutes<10) {
			minutes = '0'+minutes
		}
		time = hours + ':' + minutes
		insertMessage(nickname, message, time, true)
		// empty chat zone, and set focus on it again
		$('#message').val('').focus()
	}
}

function pressKey(e) {
	if (e.key=='Enter') {
		send()
	}
}

// add a message in the page
function insertMessage(nickname, message, time, toself) {
	var cl = 'from_server'
	if (toself) {
		cl = 'toself'
	}
	$('#chat_zone').prepend('<p class="'+cl+'">'+time+' <strong>' + nickname + '</strong> ' + message + '</p>')
}

function messageFromServer(message) {
	$('#chat_zone').prepend('<p class="from_server"><em>'+message+'</em></p>')
}

function setupList(new_list) {
	list = new_list
	displayList()
}

function addToList(nickname) {
	list.push(nickname)
	displayList()
}

function removeFromList(nickname) {
	var index = list.indexOf(nickname)
	if (index > -1) {
		list.splice(index, 1)
	}
	displayList()
}

function displayList() {
	res = '<h3>Connected users:</h3>'
	res += '<ul>'
	list.forEach(function (nickname) {
		res += '<li>'+nickname+'</li>'
	})
	res += '</ul>'
	$('#connected').html(res)
}
