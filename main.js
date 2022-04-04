'use strict';

// background__video

let video = document.getElementById("background__video");
let btn = document.getElementById("video-stop");

// Pause and play the video, and change the button text
function backgroundVideoStop() {
  if (video.paused) {
    video.play();
    btn.innerHTML = "Pause";
  } else {
    video.pause();
    btn.innerHTML = "Play";
  }
}


// console display

/* (function () {
  let old = console.log;
  let logger = document.getElementById('log');
  console.log = function () {
    for (let i = 0; i < arguments.length; i++) {
      if (typeof arguments[i] == 'object') {
          logger.innerHTML += (JSON && JSON.stringify ? JSON.stringify('> ' + arguments[i], undefined, 2) : arguments[i]) + '<br />';
      } else {
          logger.innerHTML += `> ` + arguments[i] + '<br />';
      }
    }
  }
})();
 */