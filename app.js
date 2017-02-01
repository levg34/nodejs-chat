var server_port = process.env.OPENSHIFT_NODEJS_PORT || 8080
var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1'

var express = require('express')
var app = express()
var server = require('http').createServer(app)
var io = require('socket.io').listen(server)
var ent = require('ent') // block HTML entities
var fs = require('fs')
var moment = require('moment-timezone')
var formidable = require('formidable')

var allClients = []
var specialNicknames = [{name:'levg34',password:'meuh'},{name:'madblade',password:'cuicui'},{name:'BorisG7',password:'petitbourgeois'},{name:'Remy',password:'bloup'},{name:'admin',password:'meuh'},{name:'all',password:'donotuse'}]
var sns = specialNicknames.map(function (d) {
	return d.name
})

app.use(express.static(__dirname + '/public'))

// load index.html on get /
app.get('/', function (req, res) {
	res.sendFile(__dirname + '/view/index.html')
})

// load login.html on get /login
app.get('/login', function (req, res) {
	res.sendFile(__dirname + '/view/login.html')
})

// load config variables on get /conf
app.get('/conf', function (req, res) {
	res.setHeader('Content-Type', 'text/json')
	res.end(JSON.stringify({server_port:server_port,server_ip_address:server_ip_address}))
})

function alreadyUsed(nickname) {
	var res = false
	allClients.forEach(function(socket) {
		if (socket.nickname==nickname) {
			res = true
		}
	})
	return res
}

function sendConnectedList(socket) {
	var list = []
	allClients.forEach(function (socket) {
		list.push(socket.nickname)
	})
	socket.emit('list', list)
}

function findSocket(nickname) {
	var index = allClients.map(function(socket){
		return socket.nickname
	}).indexOf(nickname)
	return allClients[index]
}

io.sockets.on('connection', function (socket, nickname) {
	// upon nickname reception, it is stored as session variable and the other clients are informed
	socket.on('new_client', function(data) {
		var nickname = data.nickname
		var password = data.password
		if (!nickname) {
			nickname=''
		}
		var old_nickname = nickname
		nickname = ent.encode(nickname)
		nickname=nickname.split(" ")[nickname.split(" ").length-1]
		//nickname=nickname.replace(/[^A-Za-z0-9\u00C0-\u017F]/g, '')
		if (nickname.length>15) {
			nickname = nickname.substr(nickname.length-15)
		}
		var index = sns.indexOf(nickname)
		if (nickname==''||nickname=='undefined'||(index!=-1&&specialNicknames[index].password!=password)) {
			nickname = 'client-'+allClients.length
		}
		if (alreadyUsed(nickname)) {
			nickname=nickname+'-'+allClients.length
		}
		if (old_nickname!=nickname) {
			socket.emit('set_nickname', nickname)
		}
		socket.nickname = nickname
		socket.broadcast.emit('new_client', nickname)
		sendConnectedList(socket)
		allClients.push(socket)
	})

	// upon message reception, the sender's nickname is captured and retransmitted to other clients
	socket.on('message', function (data) {
		var message = ent.encode(data.message)
		var to = data.to
		if (!socket.nickname) {
			var ts = Math.floor(Math.random() * 1000)
			socket.nickname = 'temp-' + ts
			socket.emit('refresh')
		}
		if (to=='all'||!findSocket(to)) {
			socket.broadcast.emit('message', {nickname: socket.nickname, message: message, time: moment().tz("Europe/Paris").format('HH:mm')})
		} else {
			findSocket(to).emit('message', {nickname: socket.nickname, message: data.message, time: moment().tz("Europe/Paris").format('HH:mm')})
		}
	})
	
	// client disconnects
	socket.on('disconnect', function() {
		var i = allClients.indexOf(socket)
		if (allClients[i]) {
			socket.broadcast.emit('client_left', allClients[i].nickname)
			allClients.splice(i, 1)
		}
	})

	// client sends public key
	socket.on('pubkey', function(pubkey) {
		socket.pubkey = pubkey
	})

	socket.on('get_pubkey', function(nickname) {
		var pubkey = findSocket(nickname).pubkey
		if (pubkey&&pubkey.startsWith('-----BEGIN PGP PUBLIC KEY BLOCK-----')) {
			socket.emit('pubkey',pubkey)
		} else {
			socket.emit('pubkey','')
		}
	})
})

server.listen(server_port,server_ip_address,function () {
	console.log("Listening on " + server_ip_address + ", port " + server_port)
})
