var Mikuia
var request = require('request')
var _

exports.manifest = {
	name: 'rotmg',
	fullName: 'Realm of the Mad God',
	type: 'channel',
	description: 'Plugin for RotMG (using RealmEye API)',
	commands: {
		'rotmg.rank': {
			description: 'Shows the rank and some basic stats of a player.',
			arguments: {
				'username': {
					description: 'Username to check.',
					optional: true
				}
			}
		}
	},
	hooks: [],
	settings: {
		channel: {
			name: {
				name: 'Username',
				default: '',
				description: 'Your RotMG username.',
				type: 'text'
			}
		},
		server: {}
	}
}

exports.init = function(m) {
	Mikuia = m
	_ = Mikuia.modules._
}

exports.handleCommand = function(command, tokens, from, Channel) {
	switch(command) {
		case 'rotmg.rank':
			if(!_.isUndefined(tokens[1])) {
				tokens.splice(0, 1)
				var user = tokens.join(' ')
			} else {
				var user = Channel.getSetting('rotmg', 'name')
			}
			if(user != undefined && user != '') {
				request('http://webhost.ischool.uw.edu/~joatwood/realmeye_api/0.3/?player=' + user, function(error, response, body) {
					if(!error) {
						try {
							var json = JSON.parse(body)
						} catch(e) {
							console.log('D: x2')
						}
						if(json != undefined) {
							if(json.fame > 0) {
								Mikuia.say(Channel.getIRCName(), 'Stats for ' + json.player + ': ★ ' + json.rank + ', ' + json.fame + ' Fame, rank #' + json.fame_rank + '.')
							} else {
								Mikuia.say(Channel.getIRCName(), 'Stats for ' + json.player + ': ★ ' + json.rank + ', ' + json.fame + ' Fame.')
							}
						} else {
							Mikuia.log(Mikuia.LogStatus.Error, 'RotMG - Failed to parse ' + user + ' JSON.')
						}
					} else {
						Mikuia.log(Mikuia.LogStatus.Error, 'RotMG - Failed to get ' + user + ' JSON.')
					}
				})
			}
			break
	}
}