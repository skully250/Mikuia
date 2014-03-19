var Mikuia

exports.manifest = {
	name: 'twitch',
	fullName: 'Twitch.tv',
	type: 'channel',
	description: 'Twitch.tv utilities',
	commands: {
		'twitch.viewers': {
			description: 'Shows the current viewer count.'
		}
	},
	settings: {}
}

exports.handleCommand = function(command, tokens, from, Channel) {
	switch(command) {
		case 'twitch.viewers':
			Channel.getViewers(function(err, viewers) {
				if(!err) {
					Mikuia.say(Channel.getIRCName(), viewers + ' viewers.')
				} else {
					Mikuia.log(Mikuia.LogStatus.Error, 'Failed to get viewer count for ' + Channel.getDisplayName() + '.')
				}
			})
			break
	}
}

exports.init = function(m) {
	Mikuia = m
}