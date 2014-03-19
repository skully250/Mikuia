var Mikuia

var userData = {}

exports.manifest = {
	name: 'lol',
	fullName: 'League of Legends',
	type: 'channel',
	description: 'Plugin for League of Legends (in development)',
	commands: {},
	hooks: [],
	settings: {
		channel: {
			name: {
				name: 'Summoner Name',
				description: 'Your LoL summoner\'s name.',
				type: 'text'
			},
			region: {
				name: 'Region',
				description: 'Your summoner\'s region (euw, eune, na).',
				type: 'text'
			}
		},
		server: {
			apiKey: 'RIOT_GAMES_API_KEY'
		}
	}
}

exports.handleCommand = function(command, tokens, from, channel) {
	
}

exports.handleMessage = function(from, channel, message) {

}

exports.init = function(m) {
	Mikuia = m
}

exports.load = function(channel) {

}

exports.runHook = function(hookName) {

}