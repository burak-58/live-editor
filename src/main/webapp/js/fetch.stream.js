import './loglevel.min.js';

var Logger = window.log;

//ask if adaptive m3u8 file

if (!String.prototype.endsWith) {
  String.prototype.endsWith = function (searchString, position) {
    var subjectString = this.toString();
    if (typeof position !== 'number' || !isFinite(position) || Math.floor(position) !== position || position > subjectString.length) {
      position = subjectString.length;
    }
    position -= searchString.length;
    var lastIndex = subjectString.lastIndexOf(searchString, position);
    return lastIndex !== -1 && lastIndex === position;
  };
}
function tryToPlay(name, token, type, subscriberId, subscriberCode, noStreamCallback) {
  fetch("streams/" + name + "_adaptive." + type + "?token=" + token + "&subscriberId=" + subscriberId + "&subscriberCode=" + subscriberCode, {
    method: 'HEAD'
  }).then(function (response) {
    if (response.status == 200) {
      // adaptive m3u8 & mpd exists,play it
      initializePlayer(name + "_adaptive", type, token, subscriberId, subscriberCode);
    } else {
      //adaptive not exists, try mpd or m3u8 exists.
      fetch("streams/" + name + "." + type + "?token=" + token + "&subscriberId=" + subscriberId + "&subscriberCode=" + subscriberCode, {
        method: 'HEAD'
      }).then(function (response) {
        if (response.status == 200) {
          initializePlayer(name, type, token, subscriberId, subscriberCode);
        } else {
          Logger.warn("No stream found");
          if (typeof noStreamCallback != "undefined") {
            noStreamCallback();
          }
        }
      }).catch(function (err) {
        Logger.warn("Error: " + err);
        if (typeof noStreamCallback != "undefined") {
          noStreamCallback();
        }
      });
    }
  }).catch(function (err) {
    Logger.warn("Error: " + err);
    if (typeof noStreamCallback != "undefined") {
      noStreamCallback();
    }
  });
}
/**
 *
 * @param {*} name
 * @param {*} playType
 * @param {*} token
 * @param {*} subscriberId
 * @param {*} subscriberCode
 * @returns
 */
function getURL(name, playType, token, subscriberId, subscriberCode) {
  var url = "streams/" + name;
  if (typeof playType != "undefined" && playType != null) {
    url += "." + playType;
  }
  url += "?";
  if (typeof token != "undefined") {
    url += "&token=" + token;
  }
  if (typeof subscriberId != "undefined") {
    url += "&subscriberId=" + subscriberId;
  }
  if (typeof subscriberCode != "undefined") {
    url += "&subscriberCode=" + subscriberCode;
  }
  return url;
}
/**
 *
 * @param {*} name
 * @param {*} token
 * @param {*} subscriberId
 * @param {*} subscriberCode
 * @param {*} noStreamCallback
 * @param {*} playType
 * @returns
 */
function tryToVODPlay(name, token, subscriberId, subscriberCode, noStreamCallback, playType) {
  if (typeof playType == "undefined" || playType == null || playType.length == 0) {
    Logger.error("playType is not defined");
    return;
  }
  var firstPlayType = playType[0];
  var secondPlayType = null;
  if (playType.length >= 2) {
    secondPlayType = playType[1];
  }

  //check if the direct file name is provided so the playtype parameter is free

  fetch(getURL(name, null, token, subscriberId, subscriberCode), {
    method: 'HEAD'
  }).then(function (response) {
    if (response.status == 200 || response.status == 304) {
      var dotIndex = name.lastIndexOf(".");
      var filename = name.substring(0, dotIndex);
      var type = name.substring(dotIndex + 1);
      initializePlayer(filename, type, token, subscriberId, subscriberCode);
    } else {
      fetch(getURL(name, firstPlayType, token, subscriberId, subscriberCode), {
        method: 'HEAD'
      }).then(function (response) {
        if (response.status == 200 || response.status == 304) {
          //firstPlayType exists, play it
          initializePlayer(name, firstPlayType, token, subscriberId, subscriberCode);
        } else if (secondPlayType != null) {
          fetch(getURL(name, secondPlayType, token, subscriberId, subscriberCode), {
            method: 'HEAD'
          }).then(function (response) {
            if (response.status == 200) {
              //secondPlayType exists, play it
              initializePlayer(name, secondPlayType, token, subscriberId, subscriberCode);
            } else {
              Logger.warn("No stream found");
              if (typeof noStreamCallback != "undefined") {
                noStreamCallback();
              }
            }
          }).catch(function (err) {
            Logger.warn("Error: " + err);
            if (typeof noStreamCallback != "undefined") {
              noStreamCallback();
            }
          });
        } else {
          Logger.warn("No stream found");
          if (typeof noStreamCallback != "undefined") {
            noStreamCallback();
          }
        }
      }).catch(function (err) {
        Logger.warn("Error: " + err);
        if (typeof noStreamCallback != "undefined") {
          noStreamCallback();
        }
      });
    }
  }).catch(function (err) {
    Logger.warn("Error: " + err);
    if (typeof noStreamCallback != "undefined") {
      noStreamCallback();
    }
  });
}
function tryToPlayIfExists(name, token, subscriberId, subscriberCode, noStreamCallback, playType) {
  if (typeof name == "undefined" || name == null || name.length == 0) {
    Logger.error("name is not defined");
    return;
  }
  if (typeof playType == "undefined" || playType == null || playType.length == 0) {
    Logger.error("playType is not defined");
    return;
  }
  // check if playtype is a string
  if (typeof playType == "string") {
    // if it's string then check if there is adaptive file
    tryToPlay(name, token, playType, subscriberId, subscriberCode, noStreamCallback);
  } else if (Array.isArray(playType)) {
    // if it's array then it's VOD, try to play
    tryToVODPlay(name, token, subscriberId, subscriberCode, noStreamCallback, playType);
  } else {
    Logger.error("playType is not defined");
  }
}
function initializePlayer(name, playType, token, subscriberId, subscriberCode) {
  if (playType == "webrtc") {
    loadWebRTCPlayer(name, token, subscriberId, subscriberCode);
  } else if (playType == "hls" || playType == "m3u8") {
    loadHLSPlayer(name, token, subscriberId, subscriberCode);
  } else if (playType == "dash" || playType == "mpd") {
    loadDASHPlayer(name, token, subscriberId, subscriberCode);
  } else if (playType == "flv") {
    loadFLVPlayer(name, token, subscriberId, subscriberCode);
  }
}
function getUrlParameter(sParam) {
  var sPageURL = decodeURIComponent(window.location.search.substring(1)),
    sURLVariables = sPageURL.split('&'),
    sParameterName,
    i;
  for (i = 0; i < sURLVariables.length; i++) {
    sParameterName = sURLVariables[i].split('=');
    if (sParameterName[0] === sParam) {
      return sParameterName[1] === undefined ? true : sParameterName[1];
    }
  }
}

export { getUrlParameter, initializePlayer, tryToPlayIfExists, tryToPlay, tryToVODPlay };
