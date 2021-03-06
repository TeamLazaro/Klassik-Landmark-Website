
( function ( $ ) {









/* -/-/-/-/- CODE STARTS HERE -/-/-/-/- */


/*
 *
 * Cookie library
 *
 * madmurphy/cookies.js
 *
 */
var docCookies={getItem:function(e){return e?decodeURIComponent(document.cookie.replace(new RegExp("(?:(?:^|.*;)\\s*"+encodeURIComponent(e).replace(/[\-\.\+\*]/g,"\\$&")+"\\s*\\=\\s*([^;]*).*$)|^.*$"),"$1"))||null:null},setItem:function(e,o,n,t,r,c){if(!e||/^(?:expires|max\-age|path|domain|secure)$/i.test(e))return!1;var s="";if(n)switch(n.constructor){case Number:s=n===1/0?"; expires=Fri, 31 Dec 9999 23:59:59 GMT":"; max-age="+n;break;case String:s="; expires="+n;break;case Date:s="; expires="+n.toUTCString()}return document.cookie=encodeURIComponent(e)+"="+encodeURIComponent(o)+s+(r?"; domain="+r:"")+(t?"; path="+t:"")+(c?"; secure":""),!0},removeItem:function(e,o,n){return this.hasItem(e)?(document.cookie=encodeURIComponent(e)+"=; expires=Thu, 01 Jan 1970 00:00:00 GMT"+(n?"; domain="+n:"")+(o?"; path="+o:""),!0):!1},hasItem:function(e){return!e||/^(?:expires|max\-age|path|domain|secure)$/i.test(e)?!1:new RegExp("(?:^|;\\s*)"+encodeURIComponent(e).replace(/[\-\.\+\*]/g,"\\$&")+"\\s*\\=").test(document.cookie)},keys:function(){for(var e=document.cookie.replace(/((?:^|\s*;)[^\=]+)(?=;|$)|^\s*|\s*(?:\=[^;]*)?(?:\1|$)/g,"").split(/\s*(?:\=[^;]*)?;\s*/),o=e.length,n=0;o>n;n++)e[n]=decodeURIComponent(e[n]);return e}};"undefined"!=typeof module&&"undefined"!=typeof module.exports&&(module.exports=docCookies);


/*
 *
 * Public API
 *
 */
__OMEGA.query = { user: { attempts: 0 } };
var Loginner = window.Loginner = { };
Loginner.prompts = { };
Loginner.registerLoginPrompt = function registerLoginPrompt ( name, handlers ) {
	Loginner.prompts[ name ] = handlers;
};


/*
 *
 * Gets a user from the database, given an id.
 * @args
 * 	identifyingAttribute -> a value holding identifiable information on a user, but with no context; ex. a UID or a phone-number, but no mention what the value is
 * 	options -> an object containing additional context on the identifyingAttribute
 *
 * Returns a promise with,
 * @params
 * 	user -> an object containing data on the user
 *
 */
function getUser ( identifyingAttribute, options ) {

	// Support different types of function invocations
		// The "just one object" argument approach
	if ( identifyingAttribute && typeof identifyingAttribute == "object" ) {
		options = identifyingAttribute;
		identifyingAttribute = null;
	}
		// The second argument `options` object approach
	else
		options = options || { };

	// Pull the user from the (memory/cookie) cache ( if there )
	var user = __OMEGA.user;
	if ( ! user )
		user = getCookieData( "omega-user" );

	// If the uid is not a number ( i.e. base64 encoded ),
	// 	then the data has to be normalized to the new storage convention
	if ( user.uid ) {
		if ( user.uid != parseInt( user.uid, 10 ) ) {
			user.uid = atob( user.uid );
			loginUser( user );
		}
	}

	// Determine whether the user being requested and the one stored locally
	// 	are the same. If no identifying attribute has been specified,
	// 	then we assume they are the same.
	var userHasChanged;
		// But before that, if it has been awhile since the user's information
		//  has been refreshed, then we fetch the user again regardless
	var userLastUpdated = getCookieData( "omega-user-updated" );
	if ( ! ( userLastUpdated && userLastUpdated.when ) )
		userHasChanged = true;
	else if ( identifyingAttribute ) {
		if ( options.by && user[ options.by ] != identifyingAttribute )
			userHasChanged = true;
		else if ( user.uid != identifyingAttribute )
			userHasChanged = true;
	}
	else
		userHasChanged = false;

	var userLastSeenAt = user.lastSeenAt || null;

	// If the user object contains more than just the meta details,
	// 	then there's no need to re-fetch it from the server
	if ( ! userHasChanged ) {
		if ( user.name )
			return Promise.resolve( user );
	}

	// If only the meta-data has been requested,
	// 	and the user being requested ain't different, then return that
	if ( options.meta )
		if ( ! userHasChanged )
			return Promise.resolve( user );


	/*
	 * If no user was found in local storage,
	 *	or the user being requested was different,
	 * 	then, we'll attempt to fetch the user from the server
	 */
	identifyingAttribute = identifyingAttribute || user.uid;
	options.by = options.by || 'uidv2';

	var project = __OMEGA.settings.Project;
	var apiEndpoint = __OMEGA.settings.apiEndpoint;
	var url = apiEndpoint + "/users";

	var data = { }
	data[ options.by ] = identifyingAttribute;
	// If we're getting the user by UID
		// Only send the project through if an executive is using the system
	if ( options.by.startsWith( "uid" ) ) {
		if ( __OMEGA.user && __OMEGA.user.role )
			data.project = project;
	}
	else {
		data.project = project;
	}

	var ajaxRequest = $.ajax( {
		url: url,
		method: "GET",
		data: data,
		dataType: "json"
	} );

	return new Promise( function ( resolve, reject ) {

		ajaxRequest.done( function ( response ) {
			var user = response.data;
			// Set the current timestamp as when the user was "last seen"
			user.lastSeenAt = userLastSeenAt || Date.now();
			// Cache the user object under the namespace
			__OMEGA.user = user;
			// Check if the user is a duplicate, if so attempt to log out and log in again with using the phone-number
			if ( user.isDuplicate ) {
				if ( __OMEGA.query.user.attempts < 1 ) {
					__OMEGA.query.user.attempts += 1;
					return resolve( getUser( user.phoneNumber, { by: "phoneNumber" } ) );
				}
				else
					__OMEGA.utils.postMail(
						"Duplicate User on Re-fetch",
						`Got a duplicate user the first time.
						Tried again using the phone number ${ user.phoneNumber } and then got a duplicate user once more.

						Name: ${ user.name }
						UID: ${ user.uid }
						Phone number: ${ user.phoneNumber }`
					);
			}
			// Set a cookie for when the user was last pulled with fresh data
			__OMEGA.utils.setCookie( "omega-user-updated", {
				when: ( new Date() ).getTime()
			}, 60 * 60 );
			// Reset the fetch attempts
			__OMEGA.query.user.attempts = 0;
			// Finally, return the user object
			resolve( user );
		} );
		ajaxRequest.fail( function ( jqXHR, textStatus, e ) {
			var errorResponse = getErrorResponse( jqXHR, textStatus, e );
			// If we previously got a duplicate user, and now we got nothing
			var user = __OMEGA.user;
			if ( user && user.isDuplicate && __OMEGA.query.user.attempts >= 1 )
				__OMEGA.utils.postMail(
					"No User on Re-fetching a Duplicate one",
					`Got a duplicate user the first time.
					Tried again using the phone number ${ user.phoneNumber } and then got no user.

					Name: ${ user.name }
					UID: ${ user.uid }
					Phone number: ${ user.phoneNumber }`
				);
			reject( errorResponse );
		} );

	} );

}
__OMEGA.utils.getUser = getUser;

/*
 *
 * Returns the user's ID if the user is logged in, otherwise `false`
 *
 */
function isUserLoggedIn () {
	var cookieString;
	var cookieData;
	try {
		cookieString = docCookies.getItem( "omega-user" );
		cookieData = JSON.parse( atob( cookieString ) );
	} catch ( e ) {
		return false;
	}
	// Store the parsed cookie data in the application state
	__OMEGA.user = __OMEGA.user || { };
	__OMEGA.user = Object.assign( __OMEGA.user, cookieData );
	return cookieData._id;
}

function triggerAuthFlowIfRequired ( event ) {

	var loginPrompt = $( event.target ).closest( "[ data-loginner ]" ).data( "loginner" );

	// If the user is logged in, let the user through
	if ( isUserLoggedIn() ) {
		var $trapSite = $( this ).closest( "[ data-loginner ]" );
		$trapSite.find( "a" ).each( function ( _i, domAnchor ) {
			var $anchor = $( domAnchor );
			var url = $anchor.data( "href" );
			$anchor.attr( "href", url );
		} );
		return;
	}

	// If the user **is not** logged in, but limited preview(s) are being allowed
	// 		then also let the user through
	// 			but do set/update a/the cookie for the next time round
	var $targetElement = $( event.target ).closest( ".js_user_required" );
	var viewThreshold = $targetElement.data( "views" ) || 0;
	if ( timesUserHasBeenLetBefore() < viewThreshold ) {
		// Update ( or create ) the cookie
		var cookie = getCookieData( "omega-user-let" );
		if ( typeof cookie.views == "number" )
			cookie.views += 1;
		else
			cookie.views = 1;
		__OMEGA.utils.setCookie( "omega-user-let", cookie, 90 * 24 * 60 * 60 );
		return;
	}

	// If the user is **not** logged in, prevent the registered event handlers from executing
	event.preventDefault();
	event.stopImmediatePropagation();

	// Prompt the user to "log in"
	if ( Loginner.prompts[ loginPrompt ] )
		Loginner.prompts[ loginPrompt ].onTrigger( event );
	$( document ).trigger( "user/login/prompt", { domLoginPromptTrigger: event.target } );

}

$( "body" ).on( "click", ".js_user_required:not( form )", triggerAuthFlowIfRequired );
// If the trap site itself is a form, then we want to hook on the form submission
$( "body" ).on( "submit", "form.js_user_required", triggerAuthFlowIfRequired );

/*
 *
 * On submitting a phone number.
 *
 */
$( document ).on( "submit", ".loginner_form_phone", function ( event ) {

	/* -----
	 * Prevent the default form submission behaviour
	 * 	which triggers the loading of a new page
	 ----- */
	event.preventDefault();

	var $form = $( event.target );
	var domForm = $form.get( 0 );

	// Get the login prompt
	var loginPrompt = $form.closest( "[ data-loginner ]" ).data( "loginner" );

	/* -----
	 * Disable the form
	 ----- */
	$form.find( "input, select, button" ).prop( "disabled", true );

	/* -----
	 * Pull the data from the form
	 ----- */
	// country code
	var $phoneCountryCode = $form.find( ".js_phone_country_code" );
	var phoneCountryCode = $phoneCountryCode.val().replace( /[^+\d]/g, "" );
	// phone number
	var $phoneNumber = $form.find( ".js_phone_number" );

	/* -----
	 * Sanitize the data
	 ----- */
	// phone number
	$phoneNumber.val( function ( _i, value ) {
		return value.replace( /\D/g, "" );
	} );

	/* -----
	 * Validate the data
	 ----- */
	$form.find( ".js_error" ).removeClass( "js_error" );
	// phone number length
	// If it's an Indian phone number, make sure it's the right length
	if ( phoneCountryCode == "+91" ) {
		if ( $phoneNumber.val().length != 10 ) {
			$phoneNumber.addClass( "js_error" );
			Loginner.prompts[ loginPrompt ].onPhoneValidationError( "Please enter a 10-digit number." );
		}
	}
	// If the form has even one error ( i.e. validation issue )
	// do not proceed
	if ( $form.find( ".js_error" ).length ) {
		$form.find( "input, select, button" ).prop( "disabled", false );
		return;
	}

	/* -----
	 * Assemble the data
	 ----- */
	var phoneNumber = phoneCountryCode + $phoneNumber.val();

	/* -----
	 * Store the data on the side
	 ----- */
	__OMEGA.user = __OMEGA.user || { };
	__OMEGA.user.phoneNumber = phoneNumber;


	/* -----
	 * Process the data
	 ----- */
	// Authenticate the user
	var context = Loginner.prompts[ loginPrompt ].context;
	var specificContext = $form.closest( "[ data-loginner ]" ).data( "context" );
	var project = __OMEGA.settings.Project;
	Loginner.prompts[ loginPrompt ].onPhoneSend.call( domForm, phoneNumber, project );
	getUser( phoneNumber, { by: "phoneNumber" } )
		.then( function ( user ) {
			// Store the user on the side
			__OMEGA.user = user;
			// If the user exists, log the user in
			loginUser( user );
			// Then, close the login prompt
			Loginner.prompts[ loginPrompt ].onLogin.call( domForm, user, specificContext );
		} )
		.catch( function ( { code, message } ) {
			// If no user was found, send an OTP
			if ( code == 1 ) {
				// If OTP verification is included, then do it
				if ( Loginner.prompts[ loginPrompt ].onShowOTP )
					return sendOTP( phoneNumber )
				// Else, create a user
				else {
					var project = __OMEGA.settings.Project;
					// Register the user
					return (
						createUser( phoneNumber, project, specificContext, context )
							// Then, log in the user
							.then( function ( user ) {
								// Log the user in
								loginUser( user );
								// Then, close the login prompt
								Loginner.prompts[ loginPrompt ].onLogin.call( domForm, user, specificContext );
							} )
							.catch( function ( { code, message } ) {
								if ( code == 1 ) {
									alert( message )
								}
							} )
					);
				}
			}
			else { // code == -1
				Loginner.prompts[ loginPrompt ].onPhoneError.call( domForm, code, message );
			}
		} )
		.then( function ( otpSessionId ) {
			if ( ! otpSessionId ) return;
			__OMEGA.user = __OMEGA.user || { };
			__OMEGA.user.otpSessionId = otpSessionId;
			var domOTPForm = $form.closest( "[ data-loginner ]" ).find( ".loginner_form_otp" ).get( 0 );
			Loginner.prompts[ loginPrompt ].onShowOTP( domForm, domOTPForm, phoneNumber, project );
		} )
		.catch( function ( { code, message } ) {
			if ( code == 1 ) {
				Loginner.prompts[ loginPrompt ].onPhoneError.call( domForm, code, message );
				$form.find( "input, select, button" ).prop( "disabled", false );
			}
		} );

} );

/*
 *
 * Get a cookie
 *
 */
function getCookieData ( name ) {
	var cookieString;
	var cookieData;
	try {
		cookieString = docCookies.getItem( name );
		cookieData = JSON.parse( atob( cookieString ) );
	}
	catch ( e ) {}
	return cookieData || { };
}

/*
 *
 * Has the user been allowed to view authorized content before?
 *	And if so, how many times?
 *
 */
function timesUserHasBeenLetBefore () {

	var cookie = getCookieData( "omega-user-let" );
	return cookie.views || 0;

}


/*
 *
 * Send an OTP to a given phone number
 *
 */
function sendOTP ( phoneNumber ) {

	var apiEndpoint = __OMEGA.settings.apiEndpoint;
	var OTPTemplate = __OMEGA.settings.OTPTemplate;

	var ajaxRequest = $.ajax( {
		url: apiEndpoint + "/otp?phoneNumber=" + phoneNumber + "&template=" + OTPTemplate,
		method: "GET",
		dataType: "json"
	} );

	return new Promise( function ( resolve, reject ) {

		ajaxRequest.done( function ( response ) {

			if ( response.Status.toLowerCase() != "error" ) {
				// return the OTP Session ID
				resolve( response.Details );
				return;
			}

			var statusCode = 1;
			var responseErrorMessage = response.Details.toLowerCase();
			if ( /invalid/.test( responseErrorMessage ) ) {
				reject( { code: statusCode, message: "The phone number you've provided is not valid. Please try again." } );
			}

		} );

		ajaxRequest.fail( function ( jqXHR, textStatus, e ) {
			var statusCode = -1;
			var message;
			if ( jqXHR.responseJSON ) {
				statusCode = jqXHR.responseJSON.statusCode;
				message = jqXHR.responseJSON.message;
			}
			else if ( typeof e == "object" ) {
				message = e.stack;
			}
			else {
				message = jqXHR.responseText;
			}
			reject( { code: statusCode, message: message } );
			// reject( statusCode, "Something went wrong. Please try again." );
		} );

	} );

}



/*
 *
 * On submitting an OTP.
 *
 */
$( document ).on( "submit", ".loginner_form_otp", function ( event ) {

	/* -----
	 * Prevent the default form submission behaviour
	 * 	which triggers the loading of a new page
	 ----- */
	event.preventDefault();

	var $form = $( event.target );
	var domForm = $form.get( 0 );

	// Get the login prompt
	var loginPrompt = $form.closest( "[ data-loginner ]" ).data( "loginner" );

	// Confirm with the user if they're okay with us collecting their personal info
	// var userIsOkayWithOurTerms = window.confirm( "By saying \"OK\", you agree to our terms, of which there are many." );

	// if ( ! userIsOkayWithOurTerms ) {
		// alert( "Sorry, you won't be able to view the full pricing." );
		// return;
	// }

	/* -----
	 * Disable the form
	 ----- */
	$form.find( "input, select, button" ).prop( "disabled", true );

	/* -----
	 * Pull the data from the form
	 ----- */
	// OTP
	$otp = $form.find( "[ name = 'otp' ]" );

	/* -----
	 * Validate the data
	 ----- */
	// Remove any prior "error"s
	$form.find( ".js_error" ).removeClass( "js_error" );
	// OTP
	if ( ! $otp.val().trim() ) {
		$otp.addClass( "js_error" );
		// alert( "Please enter the OTP." );
		Loginner.prompts[ loginPrompt ].onOTPValidationError.call( $form.get( 0 ), "Please enter the OTP." );
	}
	// If the form has even one error ( i.e. validation issue )
	// do not proceed
	if ( $form.find( ".js_error" ).length ) {
		$form.find( "input, select, button" ).prop( "disabled", false );
		return;
	}

	/* -----
	 * Assemble the data
	 ----- */
	var otp = $otp.val();

	/* -----
	 * Process the data
	 ----- */
	// Verify the OTP
	Loginner.prompts[ loginPrompt ].onOTPSend.call( domForm );
	verifyOTP( otp )
		.then( function ( response ) {
			// If the OTP matched,
			var context = Loginner.prompts[ loginPrompt ].context;
			var specificContext = $form.closest( "[ data-loginner ]" ).data( "context" );
			// Register the user
			var phoneNumber = __OMEGA.user.phoneNumber;
			var project = __OMEGA.settings.Project;
				// Call the `onOTPVerified` hook
			if ( Loginner.prompts[ loginPrompt ].onOTPVerified )
				Loginner.prompts[ loginPrompt ].onOTPVerified.call( domForm, specificContext, phoneNumber, project );

			createUser( phoneNumber, project, specificContext, context )
				// Then, log in the user
				.then( function ( user ) {
					// Log the user in
					loginUser( user );
					// Then, close the login prompt
					Loginner.prompts[ loginPrompt ].onLogin.call( domForm, user, specificContext );
				} )
				.catch( function ( { code, message } ) {
					if ( code == 1 ) {
						console.log( message )
						Loginner.prompts[ loginPrompt ].onLogin.call( domForm, phoneNumber, specificContext );
					}
				} )
			// Register a conversion
			registerConversion( specificContext );
			// Close the login prompt
			// closeLoginPrompt( loginPrompt );
		} )
		.catch( function ( { code, message } ) {
			if ( code == 1 ) {
				Loginner.prompts[ loginPrompt ].onOTPError.call( domForm, code, message );
				$form.find( "input, select, button" ).prop( "disabled", false );
			}
		} );

} );


/*
 *
 * Send an OTP to a given phone number
 *
 */
function verifyOTP ( otp ) {

	var apiEndpoint = __OMEGA.settings.apiEndpoint;

	var verificationFlow = $.ajax( {
		url: apiEndpoint + "/otp",
		method: "POST",
		data: {
			otp: otp,
			sessionId: __OMEGA.user.otpSessionId
		},
		dataType: "json"
	} );

	return new Promise( function ( resolve, reject ) {

		verificationFlow.done( function ( response ) {
			if ( response.Status.toLowerCase() != "error" ) {
				resolve( response.Details );
				return;
			}
			var statusCode = 1;
			var responseErrorMessage = response.Details.toLowerCase();
			if ( /mismatch/.test( responseErrorMessage ) ) {
				reject( { code: statusCode, message: "OTP does not match. Please try again." } );
			}
			else if ( /combination/.test( responseErrorMessage ) ) {
				reject( { code: statusCode, message: "OTP does not match. Please try again." } );
			}
			else if ( /expire/.test( responseErrorMessage ) ) {
				reject( { code: statusCode, message: "OTP has expired. Please try again." } );
			}
			else if ( /missing/.test( responseErrorMessage ) ) {
				reject( { code: statusCode, message: "Please provide an OTP." } );
			}
			else {
				reject( { code: statusCode, message: response.Details } );
			}
		} );
		verificationFlow.fail( function ( jqXHR, textStatus, e ) {
			var statusCode = -1;
			var message;
			if ( jqXHR.responseJSON ) {
				statusCode = jqXHR.responseJSON.statusCode;
				message = jqXHR.responseJSON.message;
			}
			else if ( typeof e == "object" ) {
				message = e.stack;
			}
			else {
				message = jqXHR.responseText;
			}
			reject( { code: statusCode, message: message } );
			// reject( statusCode, "The OTP you provided does not match the one we sent you." );
		} );

	} );

}



/*
 *
 * Create a user
 *
 */
function createUser ( phoneNumber, project, specificContext, context ) {

	// Build the payload
	var userImplicitNamePrefix = __OMEGA.settings.userImplicitNamePrefix;
	var assignmentRuleId = __OMEGA.settings.assignmentRuleId;
	var requestPayload = {
		phoneNumber: phoneNumber,
		specificContext: specificContext,
		context: context || "Website",
		project: project,
		assignmentRuleId: assignmentRuleId
	};

	// Fetch the lead based on the phone number
	var apiEndpoint = __OMEGA.settings.centralApiEndpoint;
	var createUser__AjaxRequest = $.ajax( {
		url: apiEndpoint + "/customers",
		method: "POST",
		data: requestPayload
	} );

	return new Promise( function ( resolve, reject ) {

		createUser__AjaxRequest.done( function ( response ) {
			var userData = {
				_id: response.data._id,
				uid: response.data.uid,
				phoneNumber: phoneNumber
			};
			__OMEGA.user = userData;

			resolve( userData );
		} );

		createUser__AjaxRequest.fail( function ( jqXHR, textStatus, e ) {
			var statusCode = -1;
			var message;
			if ( jqXHR.responseJSON ) {
				statusCode = jqXHR.responseJSON.statusCode;
				message = jqXHR.responseJSON.message;
			}
			else if ( typeof e == "object" ) {
				message = e.stack;
			}
			else {
				message = jqXHR.responseText;
			}
			reject( { code: statusCode, message: message } );
		} );

	} );

}

/*
 *
 * Update a user
 *
 */
function updateUser ( id, project, data ) {

	// Build the payload
	var requestPayload = { fields: data };

	return new Promise( function ( resolve, reject ) {

		// Fetch the lead based on the phone number
		var apiEndpoint = __OMEGA.settings.apiEndpoint;
		var updateUser__AjaxRequest = $.ajax( {
			url: apiEndpoint + "/users/" + id,
			method: "POST",
			data: requestPayload
		} );
		updateUser__AjaxRequest.done( function ( response ) {
			// var userData = response.data;
			// __OMEGA.user = userData;

			// resolve( userData );
			resolve();
		} );
		updateUser__AjaxRequest.fail( function ( jqXHR, textStatus, e ) {
			var statusCode = -1;
			var message;
			if ( jqXHR.responseJSON ) {
				statusCode = jqXHR.responseJSON.statusCode;
				message = jqXHR.responseJSON.message;
			}
			else if ( typeof e == "object" ) {
				message = e.stack;
			}
			else {
				message = jqXHR.responseText;
			}
			reject( { code: statusCode, message: message } );
		} );

	} );

}
__OMEGA.utils.updateUser = updateUser;

/*
 *
 * Gets the latest details on a user and saves it in memory
 *
 */
function loginUser ( user ) {
	// Create a cookie
	var cookieName = "omega-user";
	var cookie = {
		_id: user._id,
		uid: user.uid,
		phoneNumber: user.phoneNumber,
		project: user.project,
		lastSeenAt: Date.now()
	}
	__OMEGA.utils.setCookie( cookieName, cookie, 90 * 24 * 60 * 60 );

	// Create another one for Tag Manager
	var cookieName = "omega-user-id";
	var cookie = user.uid;
	__OMEGA.utils.setCookie( cookieName, cookie, 90 * 24 * 60 * 60 );
}
__OMEGA.utils.loginUser = loginUser;

/*
 *
 * Handle error / exception response helper
 *
 */
function getErrorResponse ( jqXHR, textStatus, e ) {
	var statusCode = -1;
	var message;
	if ( jqXHR.responseJSON ) {
		statusCode = jqXHR.responseJSON.statusCode;
		message = jqXHR.responseJSON.message;
	}
	else if ( typeof e == "object" ) {
		message = e.stack;
	}
	else {
		message = jqXHR.responseText;
	}
	return {
		code: statusCode,
		message: message
	};
}

/*
 *
 * Register a conversion
 *
 */
function registerConversion ( name ) {

	var url = location.origin + "/trac/" + name;

	var $iframe = $( "<iframe>" );
	$iframe.attr( {
		width: 0,
		height: 0,
		title: "Analytics and Tracking",
		src: url,
		style: "display:none;",
		class: "js_iframe_trac"
	} );

	$( "body" ).append( $iframe );

	var domIframe = $iframe.get( 0 );
	domIframe.contentWindow.onload = function ( e ) {
		setTimeout( function () {
			$iframe.remove();
		}, 25000 );
	}

}

/*
 *
 * Add a note to a user
 *
 */
function addNoteToUser ( title, content ) {

	return getUser( { meta: true } ).then( function ( user ) {

		if ( ! ( user && user.uid ) )
			return Promise.reject( {
				code: -1,
				message: "No user found to associate the note with."
			} );

		var project = __OMEGA.settings.Project;
		var requestPayload = {
			title: title,
			content: content
		};

		return new Promise( function ( resolve, reject ) {

			var apiEndpoint = __OMEGA.settings.apiEndpoint;
			var url = apiEndpoint
					+ "/users/" + user.uid
					+ "/notes?project=" + project;
			var addNoteToUser__AjaxRequest = $.ajax( {
				url: url,
				method: "POST",
				data: requestPayload
			} );
			addNoteToUser__AjaxRequest.done( function ( response ) {
				resolve( response );
			} );
			addNoteToUser__AjaxRequest.fail( function ( jqXHR, textStatus, e ) {
				var errorResponse = getErrorResponse( jqXHR, textStatus, e );
				reject( errorResponse );
			} );

		} );

	} );

}
__OMEGA.utils.addNoteToUser = addNoteToUser;



/*
 *
 * Make an activity for the salesperson servicing the customer
 *
 */
function createActivityForCustomer ( subject, description, customerId ) {

	var requestPayload = {
		subject: subject,
		description: description
	};
	var apiEndpoint = __OMEGA.settings.centralApiEndpoint;
	var url = apiEndpoint + "/customers/" + customerId + "/activities";
	// var url = "http://omega.capi/customers/" + customerId + "/activities";

	return new Promise( function ( resolve, reject ) {
		var ajaxRequest = $.ajax( {
			url: url,
			method: "POST",
			data: requestPayload
		} );
		ajaxRequest.done( function ( response ) {
			resolve( response );
		} );
		ajaxRequest.fail( function ( jqXHR, textStatus, e ) {
			var errorResponse = getErrorResponse( jqXHR, textStatus, e );
			reject( errorResponse );
		} );
	} );

}
__OMEGA.utils.createActivityForCustomer = createActivityForCustomer;

/* -/-/-/-/- CODE ENDS HERE -/-/-/-/- */









}( jQuery ) );
