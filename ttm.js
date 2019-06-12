var moment = require('moment-timezone')
// Firebase init
var admin = require('firebase-admin')
const dialogflow = require('dialogflow')
const uuid = require('uuid')
const projectId = process.env.PROJECT_ID

admin.initializeApp({
	credential: admin.credential.cert({
		projectId: projectId,
		clientEmail: process.env.CLIENT_EMAIL,
		privateKey: JSON.parse(process.env.PRIVATE_KEY)
	}),
	databaseURL: 'https://ttm-db.firebaseio.com'
})
// end of Firebase init
var db = admin.database()

var specialNicknames = []
var knownNicknames = []
var infoNicknames = []
var messages = []
var allMessages = []

var banned = []
var refBanned = db.ref('ttm/banned')
refBanned.on('value', function(snapshot) {
	banned = snapshot.val()
}, function (errorObject) {
	console.log("The read failed: " + errorObject.code)
})

// wikipedia api
var wikiQueryUrl = 'https://fr.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&format=json&titles='
var request = require('request')

function extractText(text) {
	var res = text
	
	// pre-process
	res = res.replace(/\{(.*?)\}/g,'')
	res = res.split('}').join('')

	// get all [[ x | y ]]
	var matched = res.match(/\[\[(.*?)\]\]/g);
	
	// replace [[ x | y ]] with content
	var id = 0;
	res = res.replace(/\[\[(.*?)\]\]/g,_=>matched[id++].split('[[').join('').split(']]').join('').replace(/(.*?)\|/g,''));

	// post-process
	res = res.split('\'\'\'').join('');
	res = res.split('[').join('')
	res = res.split('=').join('')
	res = res.split('*').join('. ')
	//res = res.split(' ;').join('.')

	return res
}

function getSentence(text) {
	var etext = extractText(text).split(/\.\s/)
	var index = 0
	var res = []

	etext.forEach(function (sentence) {
		if (sentence && sentence.indexOf('|')==-1 && sentence.indexOf('<')==-1) {
			var escapedSentence = sentence.replace(/\s/g,' ')
			if (escapedSentence.length > 10) {
				res.push(escapedSentence)
			}
		}
	})
	
	index = res.length-1
	index = Math.floor(Math.random()*res.length)

	return res[index].trim()
}

function answerWikiWord(word,callback) {
	var queryUrl = wikiQueryUrl+word

	request(queryUrl, function(error, response, body){
		var jbody = {}

		try {
			jbody = JSON.parse(body)
		} catch (e) {
			callback('Il y a une grosse couille dans le paté.')
		}

		if (jbody&&jbody.query&&jbody.query.pages) {
			var resPagesJSON = jbody.query.pages
			var thetext = ''
			var ok = true
			try {
				thetext = resPagesJSON[Object.keys(resPagesJSON)[0]].revisions[0]['*']
			} catch (e) {
				//callback('Il y a une grosse couille dans le paté.')
				ok = false
			}
			if (resPagesJSON["-1"]||!thetext||thetext.indexOf('{{homonymie}}\n{{Autres projets')!=-1) {
				// get another word
				callback('Je ne vois pas de quoi vous parlez, désolé.')
				ok = false
			}
			if (thetext.toLowerCase().indexOf('#redirect')!=-1) {
				// get another word
				callback('Je vois de quoi vous parlez, mais pouvez-vous être plus précis ?')
				//callback('Essayez par exemple de mettre le mot au singulier, ou d\'écrire le nom propre en entier.')
				
				// follow redirection 
				var redirect = thetext.split('[[')[1]
				if (redirect) {
					redirect = redirect.split(']]')[0]
					if (redirect) {
						callback('Vous voulez peut-être parler de '+redirect)
					}
				}
				ok = false
			}
			if (ok) {
				if (!thetext||!getSentence(thetext)||getSentence(thetext)=='undefined') {
					callback('Je n\'ai pas assez de connaissances sur le sujet pour me prononcer.')
				} else {
					callback(getSentence(thetext))
				}
			}
		} else {
			callback('Il y a une couille dans le paté.')
		}
	})
}

function getWordFromSentence(sentence) {
	if (sentence.toLowerCase().indexOf('que pense')!=-1||(sentence.indexOf('pense')!=-1&&(sentence.indexOf('tu')!=-1)||sentence.indexOf('vous')!=-1)&&sentence.indexOf('?')!=-1) {
		var splitter = ''
		if (sentence.indexOf(' de la ')!=-1) {
			splitter = ' de la '
		} else if (sentence.indexOf(' des ')!=-1) {
			splitter = ' des '
		} else if (sentence.indexOf(' du ')!=-1) {
			splitter = ' du '
		} else if (sentence.indexOf(' de l\'')!=-1) {
			splitter = ' de l\''
		} else if (sentence.indexOf(' de ')!=-1) {
			splitter = ' de '
		} else if (sentence.indexOf(' d\'')!=-1) {
			splitter = ' d\''
		} else {
			return false
		}
		if (!splitter) {
			return false
		} else {
			var tabres = sentence.split(splitter)
			tabres.splice(0,1)
			return tabres.join(splitter).split('?').join('').trim()
		}
	} else {
		return false
	}
}
// end of wikipedia api

function shuffle(array) {
	var currentIndex = array.length, temporaryValue, randomIndex;
	// While there remain elements to shuffle...
	while (0 !== currentIndex) {
		// Pick a remaining element...
		randomIndex = Math.floor(Math.random() * currentIndex)
		currentIndex -= 1

		// And swap it with the current element.
		temporaryValue = array[currentIndex]
		array[currentIndex] = array[randomIndex]
		array[randomIndex] = temporaryValue
	}

	return array
}

function logMessage(nickname,message,time) {
	allMessages.push({from:nickname,message:message,time:time})
	var refMessages = db.ref("ttm/messages")
	refMessages.set(allMessages)
}

// leave message
var mailbox = []
var refMB = db.ref('ttm/transmit')
refMB.on("value", function(snapshot) {
	var object = snapshot.val()
	mailbox = []
	for (var property in object) {
		if (object.hasOwnProperty(property)) {
			var o = object[property]
			o.id = property
			mailbox.push(o)
		}
	}
}, function (errorObject) {
	console.log("The read failed: " + errorObject.code)
})

function leaveMessage(from,to,message) {
	var refMessages = db.ref("ttm/transmit")
	refMessages.push({from:from,to:to,message:message,time:moment().tz("Europe/Paris").format('HH:mm')})
}
// /leave message

function setSNS(sns) {
	specialNicknames=sns
}

function removeMessages(used) {
	used.forEach(function (fromMess) {
		var index = messages.indexOf(fromMess)
		if (index!=-1) {
			messages.splice(index,1)
		}
	})
}

function randMessNb() {
	var rand = Math.random()
	var nbMess = 1
	if (rand>0.45) {
		++nbMess
	}
	if (rand>0.9) {
		++nbMess
	}
	return nbMess
}

function banWord(word) {
	banned.push(word)
	refBanned.set(banned)
}

/*function freqLetter(s) {
	var freq = {}
	for (var i = 0, l = s.length; i < l; i++) {
		var ss=s[i].toLowerCase()
		freq[ss]=freq[ss] || 0
		freq[ss]++
	}
	var ks=Object.keys(freq)
	var M=3
	var iM=-1
	for(var k=0;k<ks.length;++k){
		if(freq[ks[k]]>M){
			iM = k
		}
	}
}*/

function genAnswer(socket,message) {
	if (/(.)\1\1\1/.test(message)) {
		say(socket,genHh())
	} else {
		getAnswer(socket,message)
	}
}

function loadMessages() {
	getMessages(function (_messages) {
		messages = shuffle(_messages)
	})
}

function getMessages(callback) {
	var refMessages = db.ref("ttm/messages")
	refMessages.once("value", function(snapshot) {
		allMessages = snapshot.val()
		callback(snapshot.val())
	})
}

function genHh() {
	var h=''
	var length = Math.floor(Math.random() * 44) + 6
	while(--length>0){
		h+=(Math.random()>0.5?'h':'H')
	}
	return h
}

function greet(socket) {
	var nickname = socket.nickname
	if (specialNicknames.indexOf(nickname)==-1) {
		getAnswer(socket,'Accueil '+socket.nickname)
		getAnswer(socket, 'Comment tu t\'appelles ?')
	} else {
		getAnswer(socket,'Accueil Ancien '+nickname)
	}
}

function sendImage(socket,image) {
	socket.emit('image', {nickname: 'talktome', image: image, time: moment().tz("Europe/Paris").format('HH:mm')})
}

function say(socket,message) {
	socket.emit('message', {nickname: 'talktome', message: message, time: moment().tz("Europe/Paris").format('HH:mm')})
}

function sayAll(socket,message) {
	socket.emit('message', {nickname: 'talktome', message: message, time: moment().tz("Europe/Paris").format('HH:mm')})
	socket.broadcast.emit('message', {nickname: 'talktome', message: message, time: moment().tz("Europe/Paris").format('HH:mm')})
}

function answer(socket,message) {
	var nickname = socket.nickname
	var log = true
	var polisson = shuffle(['Petit polisson','Canaille','Fripouille','Petit chenapan','Galopin','Sacripan'])
	var sentence = polisson[0]+', on ne dit pas "'
	var bw = 0
	banned.forEach(function (word) {
		if (message.toLowerCase().indexOf(word)!=-1) {
			if (bw<=0) {
				sentence += word
			} else {
				sentence += '", ni "' + word
			}
			log = false
			++bw
		}
	})
	if (!log) {
		sentence += '" !'
		say(socket, sentence)
	}
	if (message.indexOf('message')!=-1&&message.indexOf(':')!=-1) {
		var sm = message.split(':')
		var toa = sm.shift().split(' ')
		var to = toa.pop().trim()
		while (!to) {
			to = toa.pop().trim()
		}
		var mail = sm.join(':').trim()
		var from = socket.nickname
		leaveMessage(from,to,mail)
		say(socket,'I will send your message ("'+mail+'") to '+to+' on next connection.')
	} else if (getWordFromSentence(message)) {
		answerWikiWord(getWordFromSentence(message),function(zeanswer) {
			say(socket, zeanswer)
			logMessage('talktome',zeanswer,moment().tz("Europe/Paris").format('HH:mm'))
		})
	} else {
		genAnswer(socket,message)
	}
	
	/*if (log) {
		logMessage(socket.nickname,message.replace('Talktome', 'Monsieur').replace('talktome', 'monsieur').replace('ttm', 'mec'),moment().tz("Europe/Paris").format('HH:mm'))
	}*/
}

function receive(event,data) {
	switch (event) {
		case 'client_left':
			var nickname = data
			var index = knownNicknames.indexOf(nickname)
			if (index!=-1) {
				knownNicknames.splice(index,1)
			}
			index = infoNicknames.indexOf(nickname)
			if (index!=-1) {
				infoNicknames.splice(index,1)
			}
			break
		case 'new_client':
			var socket = data
			loadMessages()
			greet(socket)
			mailbox.forEach(function(mail) {
				if (socket.nickname==mail.to) {
					say(socket,'Vous avez un message de '+mail.from+': "'+mail.message+'".')
					db.ref('ttm/transmit/'+mail.id).set(null)
				}
			})
			break
		case 'message':
			var socket = data.socket
			var nickname = socket.nickname
			var message = data.message
			if (knownNicknames.indexOf(nickname)==-1&&infoNicknames.indexOf(nickname)==-1) {
				say(socket,'Pour me parler, selectionne mon nom dans la liste "Utilisateurs connectés".')
				infoNicknames.push(nickname)
			} else {
				if (Math.random()<0.05 || message.indexOf('ttm')!=-1 || message.indexOf('talktome')!=-1) {
					getAnswer(socket,message)
				}
			}
			break
		case 'help':
			var socket = data
//			launchTutorial(socket)
		default:

			break
	}
}

/**
 * Send a query to the dialogflow agent, and return the query result.
 * @param {string} projectId The project to be used
 */
async function getAnswer(socket,message) {
  // A unique identifier for the given session
  const sessionId = uuid.v4()
  var sessionClient
  if (process.env.JSON_KEY) {
	  const credentials = JSON.parse(process.env.JSON_KEY)
	  
	  // Create a new session
	  sessionClient = new dialogflow.SessionsClient({
		  projectId,
		  credentials,
	  })
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
	  sessionClient = new dialogflow.SessionsClient()
  } else {
	  console.log('Problème de connexion à Google Cloud')
  }

  const sessionPath = sessionClient.sessionPath(projectId, sessionId)

  // The text query request.
  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        // The query to send to the dialogflow agent
        text: message,
        // The language used by the client
        languageCode: 'fr-FR',
      },
    },
  }

  // Send request and log result
  const responses = await sessionClient.detectIntent(request)
  const result = responses[0].queryResult
  if (result.fulfillmentText) {
	  say(socket, result.fulfillmentText)
  }
  console.log(responses)
}


exports.answer = answer
exports.greet = greet
exports.say = say
exports.sayAll = sayAll
exports.sendImage = sendImage

exports.sns = setSNS
exports.notify = receive
exports.getMessages = getMessages
exports.loadMessages = loadMessages
exports.leaveMessage = leaveMessage

exports.banWord = banWord
exports.db = db
