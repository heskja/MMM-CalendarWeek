/* global Module */

/* Magic Mirror
 * Module: MMM-CalendarWeek
 * Inspired by module: calendar by Michael Teenuw
 *
 * By Eirik Kvilstad Heskja
 * MIT Licensed.
 */

Module.register("MMM-CalendarWeek", {

	// Define module defaults
	defaults: {
		maximumEntries: 20, // Total Maximum Entries
		maximumNumberOfDays: 4,
		displaySymbol: true,
		defaultSymbol: "calendar", // Fontawesome Symbol see http://fontawesome.io/cheatsheet/
		displayRepeatingCountTitle: false,
		defaultRepeatingCountTitle: "",
		displayLocation: false,
		displayDescription: false,
		maxTitleLength: 30,
		wrapEvents: false, // wrap events to multiple lines breaking at maxTitleLength
		fetchInterval: 5 * 60 * 1000, // Update every 5 minutes.
		animationSpeed: 2000,
		urgency: 7,
		calendarTitle: false,
		timeFormat: "dateheaders",
		dateFormat: "dddd Do MMM",
		fullDayEventDateFormat: "MMM Do",
		getRelative: 6,
		hidePrivate: false,
		hideOngoing: false,
		hideEmptyDays: false,
		colored: false,
		showEndDate: false,
		allowDuplicate: false,
		maximumDaysPerLine: null,
		coloredSymbolOnly: false,
		tableClass: "small",
		calendars: [
			{
				symbol: "calendar",
				url: "http://www.calendarlabs.com/templates/ical/US-Holidays.ics",
			},
		],
		titleReplace: {
			"De verjaardag van ": "",
			"'s birthday": ""
		},
		broadcastEvents: true,
		excludedEvents: []
	},

	// Define required scripts.
	getStyles: function () {
		return ["MMM-CalendarWeek.css", "font-awesome.css"];
	},

	// Define required scripts.
	getScripts: function () {
		return ["moment.js"];
	},

	// Define required translations.
	getTranslations: function () {
		return {
			en: "translations/en.json",
			nb: "translations/nb.json",
			nn: "translations/nn.json"
		}
	},

	// Override start method.
	start: function () {
		Log.log("Starting module: " + this.name);

		if (this.config.maximumDaysPerLine == null) {
			this.config.maximumDaysPerLine = this.config.maximumNumberOfDays;
		}

		// Set locale.
		moment.updateLocale(config.language, this.getLocaleSpecification(config.timeFormat));

		for (var c in this.config.calendars) {
			var calendar = this.config.calendars[c];
			calendar.url = calendar.url.replace("webcal://", "http://");

			var calendarConfig = {
				maximumEntries: calendar.maximumEntries,
				maximumNumberOfDays: calendar.maximumNumberOfDays
			};

			// we check user and password here for backwards compatibility with old configs
			if(calendar.user && calendar.pass) {
				Log.warn("Deprecation warning: Please update your calendar authentication configuration.");
				Log.warn("https://github.com/MichMich/MagicMirror/tree/v2.1.2/modules/default/calendar#calendar-authentication-options");
				calendar.auth = {
					user: calendar.user,
					pass: calendar.pass
				}
			}

			this.addCalendar(calendar.url, calendar.auth, calendarConfig);
		}

		this.calendarData = {};
		this.loaded = false;
	},

	// Override socket notification handler.
	socketNotificationReceived: function (notification, payload) {
		if (notification === "CALENDAR_EVENTS") {
			if (this.hasCalendarURL(payload.url)) {
				this.calendarData[payload.url] = payload.events;
				this.loaded = true;

				if (this.config.broadcastEvents) {
					this.broadcastEvents();
				}
			}
		} else if (notification === "FETCH_ERROR") {
			Log.error("Calendar Error. Could not fetch calendar: " + payload.url);
		} else if (notification === "INCORRECT_URL") {
			Log.error("Calendar Error. Incorrect url: " + payload.url);
		} else {
			Log.log("Calendar received an unknown socket notification: " + notification);
		}

		this.updateDom(this.config.animationSpeed);
	},

	// Override dom generator.
	getDom: function () {

		var upcommingDays = {}

		var day = moment()
		var endOfCalendarWeek = day.clone().add(this.config.maximumNumberOfDays, 'days');

		while (day < endOfCalendarWeek) {
			upcommingDays[day] = [];
			day = day.clone().add(1, 'day');
		}

		var events = this.createEventList();
		var wrapper = document.createElement("table");
		wrapper.className = this.config.tableClass;

		if (events.length === 0) {
			wrapper.innerHTML = (this.loaded) ? this.translate("EMPTY") : this.translate("LOADING");
			wrapper.className = this.config.tableClass + " dimmed";
			return wrapper;
		}


		/* Sort the event into correct array of days. */
		for (var e in events) {
			var event = events[e];

			var endMoment = moment(event.endDate, "x");
			var startMoment = moment(event.startDate, "x");

			for (day in upcommingDays) {

				//Processing for multi day events
				if (this.isMultiDayEvent(event)){
					//Multiday, starting or ending this day
					if (startMoment.isSame(day, 'day')){
						//If it starts at 00:00 and does not end this day, its a full day event and should
						//be displayed without start time
						if (startMoment.hours() == 0 && startMoment.minutes() == 0){
							upcommingDays[day].push({
								description: event.description,
								fullDayEvent: true,
								geo: event.geo,
								location: event.location,
								title: event.title,
								today: event.today,
								url: event.url
							});
						} else {
							//Set end date like end of the day to fully support "showEndDate"-option
							upcommingDays[day].push({
								description: event.description,
								fullDayEvent: event.fullDayEvent,
								geo: event.geo,
								startDate: event.startDate,
								endDate: moment(event.endDate, 'x').endOf('day'),
								location: event.location,
								title: event.title,
								today: event.today,
								url: event.url
							});
						}
					//Multiday, day is within start and end
					} else if (moment(day).isBetween(startMoment, endMoment)) {
						upcommingDays[day].push({
							description: event.description,
							fullDayEvent: true,
							geo: event.geo,
							location: event.location,
							title: event.title,
							today: event.today,
							url: event.url
						});
					//Multiday, ending this day
					} else if (endMoment.isSame(day, 'day')){
						//if ending at 00:00, it actually ended the day before and should
						//not be displayed
						//Set start Day to midnight at start of this day
						if ( !(endMoment.hours() == 0 && endMoment.minutes() == 0)) {
							upcommingDays[day].push({
								description: event.description,
								fullDayEvent: !this.config.showEndDate,
								endDate: event.endDate,
								startDate: moment(event.startDate, 'x').startOf('day'),
								geo: event.geo,
								location: event.location,
								title: event.title,
								today: event.today,
								url: event.url
							});
						}
					}
				}
				//Single day events
				else if (startMoment.isSame(day, 'day')){
					upcommingDays[day].push(event);
				}
				else if (event.fullDayEvent && moment(day).isBetween(startMoment, endMoment)){
					upcommingDays[day].push(event);
				}

			}
		}

		var lastSeenDate = "";
		var idx = 0;
		var row = document.createElement("tr");

		/* Generate the view */
		for (day in upcommingDays) {

			events = upcommingDays[day];

			/* Skip processing if we have no events and want to hide empty days */
			if (events.length < 1 && this.config.hideEmptyDays){
				continue;
			}

			var col = document.createElement("td");

			col.className = "normal col";

			var dateAsString = moment(moment(day), "x").format(this.config.dateFormat);

			if(this.config.timeFormat === "dateheaders"){
				if(lastSeenDate !== dateAsString){
					var dateRow = document.createElement("tr");
					dateRow.className = "normal"
					var dateCell = document.createElement("td");

					dateCell.colSpan = "3";
					dateCell.innerHTML = this.capFirst(dateAsString);
					dateRow.appendChild(dateCell);
					col.appendChild(dateRow);

					lastSeenDate = dateAsString;
				}
			}

			/* Display label with empty-text */
			if (events.length < 1) {
				var eventWrapper = document.createElement("tr");
				var titleWrapper = document.createElement("td");

				if (!this.config.colored) {
					titleWrapper.className = "title bright";
				} else {
					titleWrapper.className = "title";
				}

				titleWrapper.colSpan = "3";

				titleWrapper.innerHTML = this.translate("EMPTY");
				eventWrapper.appendChild(titleWrapper);
				col.appendChild(eventWrapper);
			}

			for (var e in events) {
				var event = events[e];

				var eventWrapper = document.createElement("tr");

				if (this.config.colored && !this.config.coloredSymbolOnly) {
					eventWrapper.style.cssText = "color:" + this.colorForUrl(event.url);
				}

				eventWrapper.className = "normal";

				if (this.config.displaySymbol) {
					var symbolWrapper = document.createElement("td");

					if (this.config.colored && this.config.coloredSymbolOnly) {
						symbolWrapper.style.cssText = "color:" + this.colorForUrl(event.url);
					}

					symbolWrapper.className = "symbol align-right";
					var symbols = this.symbolsForUrl(event.url);
					if(typeof symbols === "string") {
						symbols = [symbols];
					}

					for(var i = 0; i < symbols.length; i++) {
						var symbol = document.createElement("span");
						symbol.className = "fa fa-fw fa-" + symbols[i];
						if(i > 0){
							symbol.style.paddingLeft = "5px";
						}
						symbolWrapper.appendChild(symbol);
					}
					eventWrapper.appendChild(symbolWrapper);
				}else if(this.config.timeFormat === "dateheaders"){
					var blankCell = document.createElement("td");
					blankCell.innerHTML = "&nbsp;&nbsp;&nbsp;"
					eventWrapper.appendChild(blankCell);
				}

				var titleWrapper = document.createElement("td"),
					repeatingCountTitle = "";

				if (this.config.displayRepeatingCountTitle) {

					repeatingCountTitle = this.countTitleForUrl(event.url);

					if (repeatingCountTitle !== "") {
						var thisYear = new Date(parseInt(event.startDate)).getFullYear(),
							yearDiff = thisYear - event.firstYear;

						repeatingCountTitle = ", " + yearDiff + ". " + repeatingCountTitle;
					}
				}

				titleWrapper.innerHTML = this.titleTransform(event.title) + repeatingCountTitle;

				if (!this.config.colored) {
					titleWrapper.className = "title bright";
				} else {
					titleWrapper.className = "title";
				}

				if(this.config.timeFormat === "dateheaders"){

					if (event.fullDayEvent) {
						titleWrapper.colSpan = "2";
						titleWrapper.align = "left";

					}else{
						var timeWrapper = document.createElement("td");
						timeWrapper.className = "time light";
						timeWrapper.align = "left";
						timeWrapper.style.paddingLeft = "2px";
						var timeFormatString = "";
						switch (config.timeFormat) {
						case 12: {
							timeFormatString = "h:mm A";
							break;
						}
						case 24: {
							timeFormatString = "HH:mm";
							break;
						}
						default: {
							timeFormatString = "HH:mm";
							break;
						}
						}
						timeWrapper.innerHTML = moment(event.startDate, "x").format(timeFormatString);

						if (this.config.showEndDate) {
							timeWrapper.innerHTML = timeWrapper.innerHTML + "</br>" + moment(event.endDate, "x").format(timeFormatString);
						}

						eventWrapper.appendChild(timeWrapper);
						titleWrapper.align = "left";
					}

					eventWrapper.appendChild(titleWrapper);
				}else{
					var timeWrapper = document.createElement("td");

					eventWrapper.appendChild(titleWrapper);
					//console.log(event.today);
					var now = new Date();
					// Define second, minute, hour, and day variables
					var oneSecond = 1000; // 1,000 milliseconds
					var oneMinute = oneSecond * 60;
					var oneHour = oneMinute * 60;
					var oneDay = oneHour * 24;
					if (event.fullDayEvent) {
						if (event.today) {
							timeWrapper.innerHTML = this.capFirst(this.translate("TODAY"));
						} else if (event.startDate - now < oneDay && event.startDate - now > 0) {
							timeWrapper.innerHTML = this.capFirst(this.translate("TOMORROW"));
						} else if (event.startDate - now < 2 * oneDay && event.startDate - now > 0) {
							if (this.translate("DAYAFTERTOMORROW") !== "DAYAFTERTOMORROW") {
								timeWrapper.innerHTML = this.capFirst(this.translate("DAYAFTERTOMORROW"));
							} else {
								timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").fromNow());
							}
						} else {
							/* Check to see if the user displays absolute or relative dates with their events
							* Also check to see if an event is happening within an 'urgency' time frameElement
							* For example, if the user set an .urgency of 7 days, those events that fall within that
							* time frame will be displayed with 'in xxx' time format or moment.fromNow()
							*
							* Note: this needs to be put in its own function, as the whole thing repeats again verbatim
							*/
							if (this.config.timeFormat === "absolute") {
								if ((this.config.urgency > 1) && (event.startDate - now < (this.config.urgency * oneDay))) {
									// This event falls within the config.urgency period that the user has set
									timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").fromNow());
								} else {
									timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").format(this.config.fullDayEventDateFormat));
								}
							} else {
								timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").fromNow());
							}
						}
					} else {
						if (event.startDate >= new Date()) {
							if (event.startDate - now < 2 * oneDay) {
								// This event is within the next 48 hours (2 days)
								if (event.startDate - now < this.config.getRelative * oneHour) {
									// If event is within 6 hour, display 'in xxx' time format or moment.fromNow()
									timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").fromNow());
								} else {
									// Otherwise just say 'Today/Tomorrow at such-n-such time'
									timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").calendar());
								}
							} else {
								/* Check to see if the user displays absolute or relative dates with their events
								* Also check to see if an event is happening within an 'urgency' time frameElement
								* For example, if the user set an .urgency of 7 days, those events that fall within that
								* time frame will be displayed with 'in xxx' time format or moment.fromNow()
								*
								* Note: this needs to be put in its own function, as the whole thing repeats again verbatim
								*/
								if (this.config.timeFormat === "absolute") {
									if ((this.config.urgency > 1) && (event.startDate - now < (this.config.urgency * oneDay))) {
										// This event falls within the config.urgency period that the user has set
										timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").fromNow());
									} else {
										timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").format(this.config.dateFormat));
									}
								} else {
									timeWrapper.innerHTML = this.capFirst(moment(event.startDate, "x").fromNow());
								}
							}
						} else {
							timeWrapper.innerHTML = this.capFirst(
								this.translate("RUNNING", {
									fallback: this.translate("RUNNING") + " {timeUntilEnd}",
									timeUntilEnd: moment(event.endDate, "x").fromNow(true)
								})
							);
						}
					}
					//timeWrapper.innerHTML += ' - '+ moment(event.startDate,'x').format('lll');
					//console.log(event);
					timeWrapper.className = "time light";
					eventWrapper.appendChild(timeWrapper);
				}

				col.appendChild(eventWrapper);

				//Display information about event location
				if (this.config.displayLocation && event.location){
					var locationWrapper = document.createElement("tr");
					locationWrapper.className = "light";
					var iconWrapper = document.createElement("td");
					iconWrapper.colSpan = "2";
					iconWrapper.className = "symbol align-right";
					var symbol = document.createElement("span");

					if (this.config.displaySymbol) {
						symbol.className = "fa fa-map-marker";
					} else {
						symbol.innerHTML = this.translate("AT").toLowerCase();
					}

					iconWrapper.appendChild(symbol);
					locationWrapper.appendChild(iconWrapper);

					var locationString = document.createElement("td");
					locationString.className = "align-left";
					locationString.innerHTML = event.location;
					locationWrapper.appendChild(locationString);


					col.appendChild(locationWrapper);
				}

				//Display information about event description
				if (this.config.displayDescription && event.description) {
					var descriptionWrapper = document.createElement("tr");
					descriptionWrapper.className = "light";
					var iconWrapper = document.createElement("td");
					iconWrapper.colSpan = "2";
					iconWrapper.className = "symbol align-right";
					var symbol = document.createElement("span");

					if (this.config.displaySymbol) {
						symbol.className = "fa fa-sticky-note-o";
					}

					iconWrapper.appendChild(symbol);
					descriptionWrapper.appendChild(iconWrapper);

					var descriptionString = document.createElement("td");
					descriptionString.className = "align-left";
					descriptionString.innerHTML = event.description;
					descriptionWrapper.appendChild(descriptionString);


					col.appendChild(descriptionWrapper);
				}
			}
			if (idx % this.config.maximumDaysPerLine == 0 && idx > 0) {
				wrapper.appendChild(row);
				row = document.createElement("tr");
			}
			row.appendChild(col);
			idx = idx + 1;
		}
		wrapper.appendChild(row);

		if (this.config.calendarTitle != false && this.config.calendarTitle.length > 0) {
			var wrapperHolder = document.createElement("div");
			var titleHolder = document.createElement("span")
			titleHolder.className = "align-left";
			titleHolder.innerHTML = this.config.calendarTitle;
			wrapperHolder.appendChild(titleHolder);
			wrapperHolder.appendChild(wrapper);

			wrapper = wrapperHolder;
		}

		return wrapper;
	},

	/**
	 * This function accepts a number (either 12 or 24) and returns a moment.js LocaleSpecification with the
	 * corresponding timeformat to be used in the calendar display. If no number is given (or otherwise invalid input)
	 * it will a localeSpecification object with the system locale time format.
	 *
	 * @param {number} timeFormat Specifies either 12 or 24 hour time format
	 * @returns {moment.LocaleSpecification}
	 */
	getLocaleSpecification: function(timeFormat) {
		switch (timeFormat) {
		case 12: {
			return { longDateFormat: {LT: "h:mm A"} };
			break;
		}
		case 24: {
			return { longDateFormat: {LT: "HH:mm"} };
			break;
		}
		default: {
			return { longDateFormat: {LT: moment.localeData().longDateFormat("LT")} };
			break;
		}
		}
	},

	/* hasCalendarURL(url)
	 * Check if this config contains the calendar url.
	 *
	 * argument url string - Url to look for.
	 *
	 * return bool - Has calendar url
	 */
	hasCalendarURL: function (url) {
		for (var c in this.config.calendars) {
			var calendar = this.config.calendars[c];
			if (calendar.url === url) {
				return true;
			}
		}

		return false;
	},

	/* createEventList()
	 * Creates the sorted list of all events.
	 *
	 * return array - Array with events.
	 */
	createEventList: function () {
		var events = [];
		var today = moment().startOf("day");
		var now = new Date();
		for (var c in this.calendarData) {
			var calendar = this.calendarData[c];
			for (var e in calendar) {
				var event = calendar[e];
				if(this.config.hidePrivate) {
					if(event.class === "PRIVATE") {
						  // do not add the current event, skip it
						  continue;
					}
				}
				if(this.config.hideOngoing) {
					if(event.startDate < now) {
						continue;
					}
				}
				if(!this.config.allowDuplicate && this.listContainsEvent(events,event)){
					continue;
				}
				event.url = c;
				event.today = event.startDate >= today && event.startDate < (today + 24 * 60 * 60 * 1000);
				events.push(event);
			}
		}

		events.sort(function (a, b) {
			return a.startDate - b.startDate;
		});

		return events.slice(0, this.config.maximumEntries);
	},


	listContainsEvent: function(eventList, event){
		for(let evt of eventList){
			if(evt.title === event.title && parseInt(evt.startDate) === parseInt(event.startDate)){
				return true;
			}
		}
		return false;

	},

	/* createEventList(url)
	 * Requests node helper to add calendar url.
	 *
	 * argument url string - Url to add.
	 */
	addCalendar: function (url, auth, calendarConfig) {
		this.sendSocketNotification("ADD_CALENDAR", {
			url: url,
			excludedEvents: calendarConfig.excludedEvents || this.config.excludedEvents,
			maximumEntries: calendarConfig.maximumEntries || this.config.maximumEntries,
			maximumNumberOfDays: calendarConfig.maximumNumberOfDays || this.config.maximumNumberOfDays,
			fetchInterval: this.config.fetchInterval,
			auth: auth
		});
	},

	/* symbolsForUrl(url)
	 * Retrieves the symbols for a specific url.
	 *
	 * argument url string - Url to look for.
	 *
	 * return string/array - The Symbols
	 */
	symbolsForUrl: function (url) {
		return this.getCalendarProperty(url, "symbol", this.config.defaultSymbol);
	},

	/* colorForUrl(url)
	 * Retrieves the color for a specific url.
	 *
	 * argument url string - Url to look for.
	 *
	 * return string - The Color
	 */
	colorForUrl: function (url) {
		return this.getCalendarProperty(url, "color", "#fff");
	},

	/* countTitleForUrl(url)
	 * Retrieves the name for a specific url.
	 *
	 * argument url string - Url to look for.
	 *
	 * return string - The Symbol
	 */
	countTitleForUrl: function (url) {
		return this.getCalendarProperty(url, "repeatingCountTitle", this.config.defaultRepeatingCountTitle);
	},

	/* getCalendarProperty(url, property, defaultValue)
	 * Helper method to retrieve the property for a specific url.
	 *
	 * argument url string - Url to look for.
	 * argument property string - Property to look for.
	 * argument defaultValue string - Value if property is not found.
	 *
	 * return string - The Property
	 */
	getCalendarProperty: function (url, property, defaultValue) {
		for (var c in this.config.calendars) {
			var calendar = this.config.calendars[c];
			if (calendar.url === url && calendar.hasOwnProperty(property)) {
				return calendar[property];
			}
		}

		return defaultValue;
	},

	/**
	 * Shortens a string if it's longer than maxLength and add a ellipsis to the end
	 *
	 * @param {string} string Text string to shorten
	 * @param {number} maxLength The max length of the string
	 * @param {boolean} wrapEvents Wrap the text after the line has reached maxLength
	 * @returns {string} The shortened string
	 */
	shorten: function (string, maxLength, wrapEvents) {
		if (typeof string !== "string") {
			return "";
		}

		if (wrapEvents === true) {
			var temp = "";
			var currentLine = "";
			var words = string.split(" ");

			for (var i = 0; i < words.length; i++) {
				var word = words[i];
				if (currentLine.length + word.length < (typeof maxLength === "number" ? maxLength : 25) - 1) { // max - 1 to account for a space
					currentLine += (word + " ");
				} else {
					if (currentLine.length > 0) {
						temp += (currentLine + "<br>" + word + " ");
					} else {
						temp += (word + "<br>");
					}
					currentLine = "";
				}
			}

			return (temp + currentLine).trim();
		} else {
			if (maxLength && typeof maxLength === "number" && string.length > maxLength) {
				return string.trim().slice(0, maxLength) + "&hellip;";
			} else {
				return string.trim();
			}
		}
	},

	/* isMultiDayEvent(event)
	 * Checks if an event is a munti day event
	 *
	 * argument event obejct - The event object to check.
	 *
	 * return bool - The event is a multi-day event.
	 *
	*/
	isMultiDayEvent: function(event) {
		return !moment(event.endDate, "x").isSame(moment(event.startDate, "x"), "day");
	},

	/* capFirst(string)
	 * Capitalize the first letter of a string
	 * Return capitalized string
	 */

	capFirst: function (string) {
		return string.charAt(0).toUpperCase() + string.slice(1);
	},

	/* titleTransform(title)
	 * Transforms the title of an event for usage.
	 * Replaces parts of the text as defined in config.titleReplace.
	 * Shortens title based on config.maxTitleLength and config.wrapEvents
	 *
	 * argument title string - The title to transform.
	 *
	 * return string - The transformed title.
	 */
	titleTransform: function (title) {
		for (var needle in this.config.titleReplace) {
			var replacement = this.config.titleReplace[needle];

			var regParts = needle.match(/^\/(.+)\/([gim]*)$/);
			if (regParts) {
			  // the parsed pattern is a regexp.
			  needle = new RegExp(regParts[1], regParts[2]);
			}

			title = title.replace(needle, replacement);
		}

		title = this.shorten(title, this.config.maxTitleLength, this.config.wrapEvents);
		return title;
	},

	/* broadcastEvents()
	 * Broadcasts the events to all other modules for reuse.
	 * The all events available in one array, sorted on startdate.
	 */
	broadcastEvents: function () {
		var eventList = [];
		for (var url in this.calendarData) {
			var calendar = this.calendarData[url];
			for (var e in calendar) {
				var event = cloneObject(calendar[e]);
				event.symbol = this.symbolsForUrl(url);
				event.color = this.colorForUrl(url);
				delete event.url;
				eventList.push(event);
			}
		}

		eventList.sort(function(a,b) {
			return a.startDate - b.startDate;
		});

		this.sendNotification("CALENDAR_EVENTS", eventList);

	}
});
