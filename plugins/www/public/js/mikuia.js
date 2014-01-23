var listeners = []

var io = io.connect()
io.emit('ready')

$(function() {
	var browserAction = true
	var content = $('#content')

	var replacePage = function(url) {
		$.each(listeners, function(index, value) {
			io.removeAllListeners(value)
		})
		listeners = []

		content.fadeOut('fast')
		$('#spinner').show()
		$.ajax({
			type: 'GET',
			url: url,
			cache: false,
			dataType: 'html'
		}).done(function(html) {
			$('#spinner').hide()
			content.html(html)
			content.fadeIn('fast')
		})
	}

	$('body').delegate('a', 'click', function(e) {
		var url = $(this).attr('href')
		if(url && url.indexOf('/') === 0 && !$(this).hasClass('noajax')) {
			e.preventDefault()
			var newUrl = '/ajax' + url
			browserAction = false
			History.pushState(null, null, url)
			browserAction = true
			replacePage(newUrl)
		} else {
			// LOL
		}
	})

	History.Adapter.bind(window, 'statechange', function() { 
		if(browserAction) {
			History.pushState(null, null, History.getState().hash)
			replacePage('/ajax' + History.getState().hash)
		}
	})

})