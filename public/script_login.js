var old_nickname = sessionStorage.nickname
var old_advanced = sessionStorage.advanced
var old_sound
if (sessionStorage.sound) {
	old_sound = JSON.parse(sessionStorage.sound)
}
var hadpw = false
if (sessionStorage.password) {
	hadpw = true
}
sessionStorage.clear()

var attempts = 3

function load() {
	if (old_nickname) {
		$('#nickname').val(old_nickname)
		$('#login_btn').prop('disabled',false)
	}
	if (old_advanced) {
		$('#advanced').prop('checked',true)
	}
	if (hadpw) {
		$('#signup_btn').hide()
	}
}

function explain(id) {
	$('#'+id).show()
}

function hideExplain(id) {
	$('#'+id).hide()
}

function showPassword() {
	$('#use_pass').hide()
	$('#signup_btn').hide()
	$('.password').each(function() {
		$(this).show()
	})
	$('#password').focus()
}

function login() {
	var nickname = $('#nickname').val()
	var password = $('#password').val()
	sessionStorage.nickname = nickname
	var logObj = {nickname:nickname}
	if (password) {
		password = sha256(password)
		sessionStorage.password = password
		logObj.password = password
	}
	if ($('#advanced').prop('checked')) {
		sessionStorage.advanced = true
	} else if (sessionStorage.advanced) {
		delete sessionStorage.advanced
	}
	var xhr = new XMLHttpRequest()
	xhr.onreadystatechange = function() {
		if (this.readyState == 4 && this.status == 200) {
			var response = JSON.parse(this.responseText)
			console.log(response)
			if (response.logOK) {
				if (old_sound) {
					sessionStorage.sound = JSON.stringify(old_sound)
				}
				window.location = '/'
			} else {
				$('#login_err').text('Server rejected your request: '+response.reason)
				if (response.nickname) {
					$('#nickname').val(response.nickname)
				}
				if (response.reason.toLowerCase().indexOf('password')!=-1) {
					if(--attempts<=0) {
						$('#signup_btn').show()
					}
				}
				$('#password').val('')
			}
		}
	}
	xhr.open('POST', '/login', true)
	xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8')
	xhr.send(JSON.stringify(logObj))
}

function signup() {
	if ($('#nickname').val()) {
		sessionStorage.nickname = $('#nickname').val()
	}
	window.location = '/signup'
}

function pressKey(e) {
	if (e.key=='Enter') {
		login()
	}
}

function input(e) {
	if ($('#nickname').val()) {
		$('#login_btn').prop('disabled',false)
	} else {
		$('#login_btn').prop('disabled',true)
	}
}