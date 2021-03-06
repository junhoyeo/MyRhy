const cntCanvas = document.getElementById('componentCanvas');
const cntCtx = cntCanvas.getContext("2d");
const tmlCanvas = document.getElementById('timelineCanvas');
const tmlCtx = tmlCanvas.getContext("2d");
let settings, tracks, song, bpm = 130, speed = 2, offset = 0, sync = 0, rate = 1, split = 2;
let mouseX = 0, mouseY = 0, mouseMode = 0;
let mode = 0; //0: move tool, 1: edit tool, 2: add tool
let zoom = 1;
let timelineYLoc = 0, timelineElementNum = 0, timelineScrollCount = 6;
let selectedValue = 0; //same with spec value
let isSettingsOpened = false;
let mouseDown = false, ctrlDown = false, shiftDown = false;
let userName = '';
let patternSeek = -1;
let lastMovedMs = -1;
let copiedElement = {"v1": '', "element": {}};

let pattern = {
  "information": {
    "version": "1.0",
    "track": "",
    "producer": "",
    "author": "",
    "bpm": "",
    "speed": "",
    "offset": ""
  },
  "patterns" : [],
  "bullets" : [],
  "triggers" : []
};
let patternHistory = [];
let pointingCntElement = {"v1": '', "v2": '', "i": ''};
let selectedCntElement = {"v1": '', "v2": '', "i": ''};
let circleBulletAngles = [];
let destroyedBullets = new Set([]);
let prevDestroyedBullets = new Set([]);

const sortAsTiming = (a, b) => {
  if(a.ms == b.ms) return 0;
  return a.ms > b.ms ? 1 : -1;
};

const calcAngleDegrees = (x, y) => {
  return Math.atan2(y, x) * 180 / Math.PI;
};

const getTan = deg => {
  let rad = deg * Math.PI / 180;
  return Math.tan(rad);
};

const settingApply = () => {
  Howler.volume(settings.sound.musicVolume / 100);
  sync = parseInt(settings.sound.offset);
};

document.addEventListener("DOMContentLoaded", () => {
  fetch(`${api}/getStatus`, {
    method: 'GET',
    credentials: 'include'
  })
  .then(res => res.json())
  .then((data) => {
    if(data.status == "Not authorized") {
      window.location.href = `${url}/authorize`;
    } else if(data.status == "Not registered") {
      window.location.href = `${url}/join`;
    } else if(data.status == "Not logined") {
      window.location.href = url;
    } else {
      fetch(`${api}/getUser`, {
        method: 'GET',
        credentials: 'include'
      })
      .then(res => res.json())
      .then((data) => {
        if(data.result == 'success') {
          userName = data.nickname;
          settings = JSON.parse(data.settings);
          settingApply();
        } else {
          alert(`Error occured.\n${data.description}`);
        }
      }).catch((error) => {
        alert(`Error occured.\n${error}`);
      });
    }
  }).catch((error) => {
    alert(`Error occured.\n${error}`);
  });
  fetch(`${api}/getTracks`, {
    method: 'GET',
    credentials: 'include'
  })
  .then(res => res.json())
  .then((data) => {
    if(data.result == 'success') {
      tracks = data.tracks;
      for(let i = 0; tracks.length > i; i++) {
        let option = document.createElement("option");
        option.innerHTML = tracks[i].name;
        option.value = tracks[i].name;
        document.getElementById("songSelectBox").options.add(option);
      }
    } else {
      alert('Failed to load song list.');
    }
  }).catch((error) => {
    alert(`Error occured.\n${error}`);
  });
  initialize();
});

const newEditor = () => {
  document.getElementById('initialButtonsContainer').style.display = 'none';
  document.getElementById('songSelectionContainer').style.display = 'flex';
};

const loadEditor = () => {
  let input = document.createElement("input");
  input.type = 'file';
  input.accept = '.json';
  input.setAttribute("onchange", `dataLoaded(event)`);
  input.click();
};

const dataLoaded = (event) => {
  let file = event.target.files[0];
  let reader = new FileReader();
  reader.onload = (e) => {
    pattern = JSON.parse(e.target.result);
    for(let i = 0; document.getElementById("songSelectBox").options.length > i; i++) {
      if(document.getElementById("songSelectBox").options[i].value == pattern.information.track) songSelectBox.selectedIndex = i;
    }
    songSelected(true);
  };
  reader.readAsText(file);
};

const songSelected = (isLoaded) => {
  song = new Howl({
    src: [`${cdn}/tracks/${settings.sound.quality}/${tracks[songSelectBox.selectedIndex].fileName}.mp3`],
    autoplay: false,
    loop: false,
    onend: () => {
      document.getElementById('controlBtn').classList.remove('timeline-play');
      document.getElementById('controlBtn').classList.remove('timeline-pause');
      document.getElementById('controlBtn').classList.add('timeline-play');
      song.stop();
    },
    onload: () => {
    }
  });
  if(!isLoaded) {
    pattern.information = {
      "version": "1.0",
      "track": tracks[songSelectBox.selectedIndex].name,
      "producer": tracks[songSelectBox.selectedIndex].producer,
      "author": userName,
      "bpm": tracks[songSelectBox.selectedIndex].bpm,
      "speed": 2,
      "offset": 0
    };
  }
  songName.innerText = pattern.information.track;
  trackSettings.getElementsByClassName('settingsPropertiesTextbox')[0].value = pattern.information.track;
  trackSettings.getElementsByClassName('settingsPropertiesTextbox')[1].value = pattern.information.producer;
  trackSettings.getElementsByClassName('settingsPropertiesTextbox')[2].value = pattern.information.author;
  trackSettings.getElementsByClassName('settingsPropertiesTextbox')[3].value = pattern.information.bpm;
  trackSettings.getElementsByClassName('settingsPropertiesTextbox')[4].value = pattern.information.speed;
  trackSettings.getElementsByClassName('settingsPropertiesTextbox')[5].value = pattern.information.offset;
  bpm = pattern.information.bpm;
  offset = pattern.information.offset;
  speed = pattern.information.speed;
  document.getElementById('percentage').innerText = '100%';
  rate = 1;
  document.getElementById('canvasBackgroundImage').style.backgroundImage = `url(${cdn}/albums/${tracks[songSelectBox.selectedIndex].fileName}.png)`;
  document.getElementById('songSelectionContainer').style.display = 'none';
  document.getElementById('initialScreenContainer').style.display = 'none';
  document.getElementById('editorMainContainer').style.display = 'initial';
  window.requestAnimationFrame(cntRender);
  patternChanged();
};

const toggleSettings = () => {
  if(isSettingsOpened) {
    document.getElementById('settingsContainer').style.display = 'none';
    document.getElementById('timelineContainer').style.width = '100vw';
    document.getElementById('timelineZoomController').style.right = '1.5vw';
    document.getElementById('timelineSplitController').style.left = '11vw';
    tmlCanvas.style.width = '100vw';
    tmlCanvas.width = window.innerWidth;
  } else {
    document.getElementById('settingsContainer').style.display = 'flex';
    document.getElementById('timelineContainer').style.width = '80vw';
    document.getElementById('timelineZoomController').style.right = '21vw';
    document.getElementById('timelineSplitController').style.left = '9vw';
    tmlCanvas.style.width = '80vw';
    tmlCanvas.width = window.innerWidth * 0.8;
  }
  isSettingsOpened = !isSettingsOpened;
};

const changeMode = (n) => {
  document.getElementsByClassName('menuIcon')[n].classList.toggle('menuSelected');
  document.getElementsByClassName('menuIcon')[mode].classList.toggle('menuSelected');
  document.getElementsByClassName('menuIcon')[n].classList.toggle('clickable');
  document.getElementsByClassName('menuIcon')[mode].classList.toggle('clickable');
  mode = n;
} 

const drawNote = (p, x, y, s) => {
  p = Math.max(p, 0);
  x = cntCanvas.width / 200 * (x + 100);
  y = cntCanvas.height / 200 * (y + 100);
  let w = cntCanvas.width / 40;
  let grd = cntCtx.createLinearGradient(x - w, y - w, x + w, y + w);
  let opacity = 1;
  if(p > 100) {
    opacity = (130 - p) / 130;
  }
  if(s == true) {
    grd.addColorStop(0, `rgba(235, 213, 52, ${opacity})`);
    grd.addColorStop(1, `rgba(235, 213, 52, ${opacity})`);
  } else {
    grd.addColorStop(0, `rgba(251, 73, 52, ${opacity})`);
    grd.addColorStop(1, `rgba(235, 217, 52, ${opacity})`);
  }
  cntCtx.strokeStyle = grd;
  cntCtx.fillStyle = grd;
  cntCtx.lineWidth = Math.round(cntCanvas.width / 500);
  cntCtx.beginPath();
  cntCtx.arc(x, y, w, 0, p / 50 * Math.PI);
  cntCtx.stroke();
  cntCtx.beginPath();
  cntCtx.arc(x, y, w / 100 * p, 0, 2 * Math.PI);
  cntCtx.fill();
};

const drawBullet = (n, x, y, a, s) => {
  x = cntCanvas.width / 200 * (x + 100);
  y = cntCanvas.height / 200 * (y + 100);
  let w = cntCanvas.width / 80;
  if(s == true) {
    cntCtx.fillStyle = "#ebd534";
    cntCtx.strokeStyle = "#ebd534";
  } else {
    cntCtx.fillStyle = "#555";
    cntCtx.strokeStyle = "#555";
  }
  cntCtx.beginPath();
  switch(n) {
    case 0:
      a = Math.PI * (a / 180 + 0.5);
      cntCtx.arc(x, y, w, a, a + Math.PI);
      a = a - (0.5 * Math.PI);
      cntCtx.moveTo(x - (w * Math.sin(a)), y + (w * Math.cos(a)));
      cntCtx.lineTo(x + (w * 2 * Math.cos(a)), y + (w * 2 * Math.sin(a)));
      cntCtx.lineTo(x + (w * Math.sin(a)), y - (w * Math.cos(a)));
      cntCtx.fill();
      break;
    case 1:
      cntCtx.arc(x, y, w, 0, Math.PI * 2);
      cntCtx.fill();
      break;
    default:
      alert("Wrong draw access.");
  }
};

const drawParticle = (n, x, y) => {
  if(n == 0) {
    x = cntCanvas.width / 200 * (x + 100);
    y = cntCanvas.height / 200 * (y + 100);
    let randomDirection = [];
    for(let i = 0; i < 3; i++) {
      let x = Math.floor(Math.random() * 4) - 2;
      let y = Math.floor(Math.random() * 4) - 2;
      randomDirection[i] = [x, y];
    }
    const raf = (n, w) => {
      w -= 0.1;
      for(let i = 0; i < 3; i++) {
        cntCtx.beginPath();
        cntCtx.fillStyle = '#222';
        cntCtx.arc(x + (n * randomDirection[i][0]), y + (n * randomDirection[i][1]), w, 0, 2 * Math.PI);
        cntCtx.fill();
      }
      if(w - 0.1 >= 0) {
        requestAnimationFrame(() => {
          raf(++n, w);
        });
      }
    };
    raf(1, 5);
  }
};

const eraseCnt = () => {
  cntCtx.clearRect(0, 0, cntCanvas.width, cntCanvas.height);
}

const eraseTml = () => {
  tmlCtx.clearRect(0, 0, tmlCanvas.width, tmlCanvas.height);
}

const initialize = () => {
  cntCanvas.width = window.innerWidth * 0.6;
  cntCanvas.height = window.innerHeight * 0.65;
  tmlCanvas.width = window.innerWidth;
  tmlCanvas.height = window.innerHeight * 0.27;
};

const gotoMain = (isCalledByMain) => {
  if(isCalledByMain || confirm(rusure)) {
    if(!isCalledByMain) song.stop();
    changeSettingsMode(-1);
    if(isSettingsOpened) toggleSettings();
    selectedCntElement = {"v1": '', "v2": '', "i": ''};
    document.getElementById('initialScreenContainer').style.display = 'block';
    document.getElementById('initialButtonsContainer').style.display = 'flex';
    document.getElementById('songSelectionContainer').style.display = 'none';
    songSelectBox.selectedIndex = 0;
    document.getElementById('editorMainContainer').style.display = 'none';
    pattern = {
      "information": {
        "version": "1.0",
        "track": "",
        "producer": "",
        "author": "",
        "bpm": "",
        "speed": "",
        "offset": ""
      },
      "patterns" : [],
      "bullets" : [],
      "triggers" : []
    };
    patternHistory = [];
  }
};

const trackMouseSelection = (i, v1, v2, x, y) => {
  if(mode != 2 && !mouseMode) {
    if(pointingCntElement.i == '') { //MEMO: this line rejects overlap of tracking
      const seek = song.seek() - (offset + sync) / 1000;
      const powX = (mouseX - x) * canvasContainer.offsetWidth / 200;
      const powY = (mouseY - y) * canvasContainer.offsetHeight / 200;
      switch(v1) {
        case 0:
          const p = ((bpm * 14 / speed) - (pattern.patterns[i].ms - (seek * 1000))) / (bpm * 14 / speed) * 100;
          if(Math.sqrt(Math.pow(powX, 2) + Math.pow(powY, 2)) <= cntCanvas.width / 40 && p <= 100) {
            pointingCntElement = {"v1": v1, "v2": v2, "i": i};
          }
          break;
        case 1:
          if(Math.sqrt(Math.pow(powX, 2) + Math.pow(powY, 2)) <= cntCanvas.width / (song.playing() ? 80 : 50)) {
            pointingCntElement = {"v1": v1, "v2": v2, "i": i};
          }
          break;
        default:
          alert("trackMouseSelection:Error");
      }
    }
  }
};

const selectedCheck = (n, i) => {
  return pointingCntElement.v1 === n && pointingCntElement.i == i || selectedCntElement.v1 === n && selectedCntElement.i == i;
};

const tmlRender = () => {
  eraseTml();
  const tmlStartX = tmlCanvas.width / 10,
        startX = tmlCanvas.width / 80,
        startY = tmlCanvas.height / 6,
        endX = tmlCanvas.width / 1.01,
        endY = tmlCanvas.height / 1.1,
        height = tmlCanvas.height / 9;
  const seek = song.seek(),
        minutes = Math.floor(seek / 60),
        seconds = seek - minutes * 60;
  const renderStart = parseInt(seek * 1000) - (60000 / bpm * zoom),
        renderEnd = parseInt(renderStart + (5000 * zoom)),
        msToPx = (endX - tmlStartX) / (renderEnd - renderStart);
  let baseMs = 60 / bpm * 1000;
  tmlCtx.beginPath();
  tmlCtx.fillStyle = '#F3F3F3';
  tmlCtx.fillRect(tmlStartX, startY, endX - tmlStartX, endY - startY);
  let start = lowerBound(pattern.patterns, renderStart);
  let end = upperBound(pattern.patterns, renderEnd);
  const renderNotes = pattern.patterns.slice(start, end);
  start = lowerBound(pattern.bullets, renderStart);
  end = upperBound(pattern.bullets, renderEnd);
  const renderBullets = pattern.bullets.slice(start, end);
  let bulletsOverlapNum = 1;
  let bulletsOverlap = {};
  for(let i = 0; i < renderBullets.length; i++) {
    let count = 0;
    if(bulletsOverlap[parseInt(renderBullets[i].ms / 100)]) {
      bulletsOverlap[parseInt(renderBullets[i].ms / 100)]++;
    } else {
      bulletsOverlap[parseInt(renderBullets[i].ms / 100)] = 1;
    }
    for(let j = 0; j < renderBullets.length; j++) {
      if(parseInt(renderBullets[i].ms / 100) == parseInt(renderBullets[j].ms / 100)) {
        count++;
      }
    }
    if(bulletsOverlapNum < count) bulletsOverlapNum = count;
  }
  for(let j = 0; j < renderNotes.length; j++) {
    tmlCtx.beginPath();
    if(start + j == selectedCntElement.i && selectedCntElement.v1 == '0') {
      tmlCtx.fillStyle = "#ed5b45";
    } else {
      tmlCtx.fillStyle = '#fbaf34';
    }
    tmlCtx.arc(tmlStartX + parseInt((renderNotes[j].ms - renderStart) * msToPx), startY + timelineYLoc + height / 2, height / 3, 0, 2 * Math.PI);
    tmlCtx.fill();
  }
  for(let j = 0; j < renderBullets.length; j++) {
    tmlCtx.beginPath();
    if(start + j == selectedCntElement.i && selectedCntElement.v1 == '1') {
      tmlCtx.fillStyle = "#ed5b45";
    } else {
      tmlCtx.fillStyle = '#4297d4';
    }
    let x = tmlStartX + parseInt((renderBullets[j].ms - renderStart) * msToPx);
    let y = startY + timelineYLoc + height * bulletsOverlap[parseInt(renderBullets[j].ms / 100)] + height / 2;
    let w = height / 3;
    if(renderBullets[j].value == 0) {
      tmlCtx.moveTo(x - w, y);
      tmlCtx.lineTo(x, y + w);
      tmlCtx.lineTo(x + w, y);
      tmlCtx.lineTo(x, y - w);
      tmlCtx.lineTo(x - w, y);
    } else if(renderBullets[j].value == 1) {
      tmlCtx.arc(x, y, w, 0, 2 * Math.PI);
    }
    bulletsOverlap[parseInt(renderBullets[j].ms / 100)]--;
    tmlCtx.fill();
  }
  start = lowerBound(pattern.triggers, renderStart);
  end = upperBound(pattern.triggers, renderEnd);
  const renderTriggers = pattern.triggers.slice(start, end);
  let triggersOverlapNum = 2;
  let triggersOverlap = {};
  for(let i = 0; i < renderTriggers.length; i++) {
    let count = 0;
    if(triggersOverlap[parseInt(renderTriggers[i].ms / 100)]) {
      triggersOverlap[parseInt(renderTriggers[i].ms / 100)]++;
    } else {
      triggersOverlap[parseInt(renderTriggers[i].ms / 100)] = 1;
    }
    for(let j = 0; j < renderTriggers.length; j++) {
      if(parseInt(renderTriggers[i].ms / 100) == parseInt(renderTriggers[j].ms / 100)) {
        count++;
      }
    }
    if(triggersOverlapNum < count + 1) triggersOverlapNum = count + 1;
  }
  for(let j = 0; j < renderTriggers.length; j++) {
    tmlCtx.beginPath();
    if(start + j == selectedCntElement.i && selectedCntElement.v1 == '2') {
      tmlCtx.fillStyle = "#ed5b45";
    } else {
      tmlCtx.fillStyle = "#2ec90e";
    }
    let x = tmlStartX + parseInt((renderTriggers[j].ms - renderStart) * msToPx);
    let y = startY + timelineYLoc + height * (bulletsOverlapNum + triggersOverlap[parseInt(renderTriggers[j].ms / 100)]) + height / 2;
    let w = height / 3;
    tmlCtx.moveTo(x - w / 1.1, y - w);
    tmlCtx.lineTo(x + w / 1.1, y);
    tmlCtx.lineTo(x - w / 1.1, y + w);
    tmlCtx.lineTo(x - w / 1.1, y - w);
    triggersOverlap[parseInt(renderTriggers[j].ms / 100)]--;
    tmlCtx.fill();
  }
  tmlCtx.fillStyle = '#FFF';
  tmlCtx.fillRect(0, 0, tmlStartX, endY);
  tmlCtx.beginPath();
  tmlCtx.fillStyle = '#fbaf34';
  tmlCtx.arc(startX, startY + height / 2 + timelineYLoc, height / 6, 0, 2 * Math.PI);
  tmlCtx.fill();
  tmlCtx.fillStyle = '#111';
  tmlCtx.textAlign = "left";
  tmlCtx.font = `${tmlCanvas.height / 14}px Metropolis`;
  tmlCtx.fillText('Note', startX * 1.2 + height / 6, startY + timelineYLoc + height / 1.8);
  let i = 1;
  for(i; i <= bulletsOverlapNum; i++) {
    tmlCtx.beginPath();
    tmlCtx.fillStyle = '#2f91ed';
    tmlCtx.arc(startX, startY + timelineYLoc + height * i + height / 2, height / 6, 0, 2 * Math.PI);
    tmlCtx.fill();
    tmlCtx.fillStyle = '#111';
    tmlCtx.fillText('Bullet', startX * 1.2 + height / 6, startY + timelineYLoc + height * i + height / 1.8);
  }
  for(i; i < bulletsOverlapNum + triggersOverlapNum; i++) {
    tmlCtx.beginPath();
    tmlCtx.fillStyle = '#2ec90e';
    tmlCtx.arc(startX, startY + height * i + height / 2 + timelineYLoc, height / 6, 0, 2 * Math.PI);
    tmlCtx.fill();
    tmlCtx.fillStyle = '#111';
    tmlCtx.fillText('Trigger', startX * 1.2 + height / 6, startY + timelineYLoc + height * i + height / 1.8);
  }
  timelineElementNum = i;
  tmlCtx.fillStyle = '#FFF';
  tmlCtx.fillRect(0, endY, endX, tmlCanvas.height - endY);
  tmlCtx.fillRect(0, 0, endX, startY);
  tmlCtx.font = `${tmlCanvas.height / 16}px Metropolis`;
  tmlCtx.textAlign = "center";
  tmlCtx.textBaseline = "bottom";
  tmlCtx.fillStyle = '#777';
  for(let t = (baseMs - renderStart % baseMs) - baseMs; t <= renderEnd + baseMs; t += baseMs) {
    if((renderStart + t) / 1000 < song._duration && (renderStart + t) / 1000 >= 0) {
      const tmlMinutes = Math.floor((renderStart + t) / 60000),
            tmlSeconds = (renderStart + t) / 1000 - tmlMinutes * 60;
      tmlCtx.fillText(`${String(tmlMinutes).padStart(2, '0')}:${tmlSeconds.toFixed(2).padStart(5, '0')}`, tmlStartX + t * msToPx, startY / 1.3);
      for(let i = 0; i < split; i++) {
        tmlCtx.beginPath();
        let strokeY;
        if(i == 0) {
          tmlCtx.strokeStyle = '#555';
          strokeY = startY - 10;
        } else {
          tmlCtx.strokeStyle = '#999';
          strokeY = startY - 5;
        }
        tmlCtx.moveTo(tmlStartX + t * msToPx + baseMs * msToPx / split * i, startY);
        tmlCtx.lineTo(tmlStartX + t * msToPx + baseMs * msToPx / split * i, strokeY);
        tmlCtx.stroke();
      }
    }
  }
  tmlCtx.fillStyle = '#FFF';
  tmlCtx.fillRect(0, 0, tmlStartX, startY);
  tmlCtx.fillStyle = '#2f91ed';
  tmlCtx.font = `${tmlCanvas.height / 11}px Heebo`;
  tmlCtx.textBaseline = "middle";
  tmlCtx.textAlign = "right";
  if(tmlCanvas.height / tmlCanvas.width < 0.16) {
    if(isNaN(minutes)) {
      tmlCtx.fillText('Wait..', tmlStartX, startY / 1.7);
    } else {
      tmlCtx.fillText(`${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}`, tmlStartX, startY / 1.7);
    }
  }
  tmlCtx.beginPath();
  tmlCtx.fillStyle = '#ed5b45';
  tmlCtx.strokeStyle = '#ed5b45';
  let lineX = tmlStartX + baseMs * (endX - tmlStartX) / 5000;
  tmlCtx.moveTo(lineX, endY);
  tmlCtx.lineTo(lineX, startY);
  tmlCtx.stroke();
};

const cntRender = () => {
  pointingCntElement = {"v1": '', "v2": '', "i": ''};
  window.requestAnimationFrame(cntRender);
  const seek = song.seek() - (offset + sync) / 1000;
  let start = lowerBound(pattern.triggers, 0);
  let end = upperBound(pattern.triggers, seek * 1000 + 2); //2 for floating point miss
  const renderTriggers = pattern.triggers.slice(start, end);
  eraseCnt();
  destroyedBullets.clear();
  let bpmCount = 0, speedCount = 0, opacityCount = 0;
  for(let i = 0; i < renderTriggers.length; i++) {
    if(renderTriggers[i].value == 0) {
      if(!destroyedBullets.has(renderTriggers[i].num)) {
        if(!prevDestroyedBullets.has(renderTriggers[i].num)) {
          let j = renderTriggers[i].num;
          const p = (seek * 1000 - pattern.bullets[j].ms) / (bpm * 40 / speed / pattern.bullets[j].speed) * 100;
          const left = pattern.bullets[j].direction == 'L';
          let x = (left ? -1 : 1) * (100 - p);
          let y = 0;
          if(pattern.bullets[j].value == 0) {
            y = pattern.bullets[j].location + p * getTan(pattern.bullets[j].angle) * (left ? 1 : -1);
          } else {
            if(!circleBulletAngles[j]) circleBulletAngles[j] = calcAngleDegrees((left ? -100 : 100) - mouseX, pattern.bullets[j].location - mouseY);
            if(left) {
              if(110 > circleBulletAngles[j] && circleBulletAngles[j] > 0) circleBulletAngles[j] = 110;
              else if(0 > circleBulletAngles[j] && circleBulletAngles[j] > -110) circleBulletAngles[j] = -110;
            } else {
              if(70 < circleBulletAngles[j] && circleBulletAngles[j] > 0) circleBulletAngles[j] = 70;
              else if(0 > circleBulletAngles[j] && circleBulletAngles[j] < -70) circleBulletAngles[j] = -70;
            }
            y = pattern.bullets[j].location + p * getTan(circleBulletAngles[j]) * (left ? 1 : -1);
          }
          drawParticle(0, x, y);
        }
        destroyedBullets.add(renderTriggers[i].num);
      }
    } else if(renderTriggers[i].value == 1) {
      start = lowerBound(pattern.bullets, seek * 1000 - (bpm * 40));
      end = upperBound(pattern.bullets, seek * 1000);
      const renderBullets = pattern.bullets.slice(start, end);
      for(let j = 0; renderBullets.length > j; j++) {
        if(!destroyedBullets.has(start + j)) {
          if(!prevDestroyedBullets.has(start + j)) {
            const p = (seek * 1000 - renderBullets[j].ms) / (bpm * 40 / speed / renderBullets[j].speed) * 100;
            const left = renderBullets[j].direction == 'L';
            let x = (left ? -1 : 1) * (100 - p);
            let y = 0;
            if(renderBullets[j].value == 0) {
              y = renderBullets[j].location + p * getTan(renderBullets[j].angle) * (left ? 1 : -1);
            } else {
              if(!circleBulletAngles[start+j]) circleBulletAngles[start+j] = calcAngleDegrees((left ? -100 : 100) - mouseX, renderBullets[j].location - mouseY);
              if(left) {
                if(110 > circleBulletAngles[start+j] && circleBulletAngles[start+j] > 0) circleBulletAngles[start+j] = 110;
                else if(0 > circleBulletAngles[start+j] && circleBulletAngles[start+j] > -110) circleBulletAngles[start+j] = -110;
              } else {
                if(70 < circleBulletAngles[start+j] && circleBulletAngles[start+j] > 0) circleBulletAngles[start+j] = 70;
                else if(0 > circleBulletAngles[start+j] && circleBulletAngles[start+j] < -70) circleBulletAngles[start+j] = -70;
              }
              y = renderBullets[j].location + p * getTan(circleBulletAngles[start+j]) * (left ? 1 : -1);
            }
            drawParticle(0, x, y);
          }
          destroyedBullets.add(start + j);
        }
      }
    } else if(renderTriggers[i].value == 2) {
      bpmCount++;
      bpm = renderTriggers[i].bpm;
    } else if(renderTriggers[i].value == 3) {
      opacityCount++;
      cntCanvas.style.opacity = renderTriggers[i].opacity;
    } else if(renderTriggers[i].value == 4) {
      speedCount++;
      speed = renderTriggers[i].speed;
    } else if(renderTriggers[i].value == 5) {
      if(renderTriggers[i].ms - 1 <= seek * 1000 && renderTriggers[i].ms + renderTriggers[i].time > seek * 1000) {
        cntCtx.beginPath();
        cntCtx.fillStyle = "#111";
        cntCtx.font = `${renderTriggers[i].size} Metropolis`;
        cntCtx.textAlign = renderTriggers[i].align;
        cntCtx.fillText(renderTriggers[i].text, cntCanvas.width / 200 * (renderTriggers[i].x + 100), cntCanvas.height / 200 * (renderTriggers[i].y + 100));
      }
    }
  }
  if(!bpmCount) {
    bpm = pattern.information.bpm;
  }
  if(!speedCount) {
    speed = pattern.information.speed;
  }
  if(!opacityCount) {
    cntCanvas.style.opacity = 1;
  }
  prevDestroyedBullets = new Set(destroyedBullets);
  start = lowerBound(pattern.patterns, seek * 1000 - (bpm * 4 / speed));
  end = upperBound(pattern.patterns, seek * 1000 + (bpm * 14 / speed));
  const renderNotes = pattern.patterns.slice(start, end);
  if(mode == 2 && mouseMode == 0) {
    let p = [0, 0];
    if(mouseX < -80) {
      p[0] = (-80 - mouseX) / 20;
    } else if(mouseX > 80) {
      p[1] = (mouseX - 80) / 20;
    }
    if(p[0] == 0 && p[1] == 0) {
      drawNote(100, mouseX, mouseY, true);
    } else {
      if(p[1] == 0) {
        drawBullet(selectedValue, -100, mouseY, 0, true);
      } else {
        drawBullet(selectedValue, 100, mouseY, 180, true);
      }
    }
  }
  for(let i = 0; i < renderNotes.length; i++) {
    const p = ((bpm * 14 / speed) - (renderNotes[i].ms - (seek * 1000))) / (bpm * 14 / speed) * 100;
    trackMouseSelection(start + i, 0, renderNotes[i].value, renderNotes[i].x, renderNotes[i].y);
    drawNote(p, renderNotes[i].x, renderNotes[i].y, selectedCheck(0, start + i));
  }
  start = lowerBound(pattern.bullets, seek * 1000 - (bpm * 40));
  end = upperBound(pattern.bullets, seek * 1000);
  const renderBullets = pattern.bullets.slice(start, end);
  for(let i = 0; i < renderBullets.length; i++) {
    if(!destroyedBullets.has(start + i)) {
      const p = (seek * 1000 - renderBullets[i].ms) / (bpm * 40 / speed / renderBullets[i].speed) * 100;
      const left = renderBullets[i].direction == 'L';
      let x = (left ? -1 : 1) * (100 - p);
      let y = 0;
      if(renderBullets[i].value == 0) {
        y = renderBullets[i].location + p * getTan(renderBullets[i].angle) * (left ? 1 : -1);
        trackMouseSelection(start + i, 1, renderBullets[i].value, x, y);
        drawBullet(renderBullets[i].value, x, y, renderBullets[i].angle + (left ? 0 : 180), selectedCheck(1, start + i));
      } else {
        if(!circleBulletAngles[start+i]) circleBulletAngles[start+i] = calcAngleDegrees((left ? -100 : 100) - mouseX, renderBullets[i].location - mouseY);
        if(left) {
          if(110 > circleBulletAngles[start+i] && circleBulletAngles[start+i] > 0) circleBulletAngles[start+i] = 110;
          else if(0 > circleBulletAngles[start+i] && circleBulletAngles[start+i] > -110) circleBulletAngles[start+i] = -110;
        } else {
          if(70 < circleBulletAngles[start+i] && circleBulletAngles[start+i] > 0) circleBulletAngles[start+i] = 70;
          else if(0 > circleBulletAngles[start+i] && circleBulletAngles[start+i] < -70) circleBulletAngles[start+i] = -70;
        }
        y = renderBullets[i].location + p * getTan(circleBulletAngles[start+i]) * (left ? 1 : -1);
        trackMouseSelection(start + i, 1, renderBullets[i].value, x, y);
        drawBullet(renderBullets[i].value, x, y, '', selectedCheck(1, start + i));
      }
    }
  }
  tmlRender();
  if(pointingCntElement.i === '') {
    componentView.style.cursor = "";
  } else {
    componentView.style.cursor = "url('/images/parts/cursor/blueSelect.cur'), pointer";
  }
};

const songPlayPause = () => {
  if(document.getElementById('editorMainContainer').style.display == 'initial') {
    if(song.playing()){
      document.getElementById('controlBtn').classList.add('timeline-play');
      document.getElementById('controlBtn').classList.remove('timeline-pause');
      song.pause();
    } else {
      document.getElementById('controlBtn').classList.add('timeline-pause');
      document.getElementById('controlBtn').classList.remove('timeline-play');
      circleBulletAngles = [];
      song.play();
    }
  }
};

const lowerBound = (array, value) => {
  if(value < 0) value = 0;
  let low = 0;
  let high = array.length;
  while (low < high) {
    const mid = Math.floor(low + (high - low) / 2);
    if (value <= array[mid].ms) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
};

const upperBound = (array, value) => {
  let low = 0;
  let high = array.length;
  while (low < high) {
    const mid = Math.floor(low + (high - low) / 2);
    if (value >= array[mid].ms) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

const save = () => {
  let trackSettingsForm = trackSettings.getElementsByClassName('settingsPropertiesTextbox');
  pattern.information = {
    "version": "1.0",
    "track": trackSettingsForm[0].value,
    "producer": trackSettingsForm[1].value,
    "author": trackSettingsForm[2].value,
    "bpm": bpm,
    "speed": speed,
    "offset": offset
  };
  let a = document.createElement("a");
  let file = new Blob([JSON.stringify(pattern)], {type: 'application/json'});
  a.href = URL.createObjectURL(file);
  a.download = `${songName.innerText}.json`;
  a.click();
};

const deleteAll = () => {
  if(confirm(deleteSure)) {
    song.stop();
    changeSettingsMode(-1);
    if(isSettingsOpened) toggleSettings();
    selectedCntElement = {"v1": '', "v2": '', "i": ''};
    pattern = {
      "information": {
        "version": "1.0",
        "track": "",
        "producer": "",
        "author": "",
        "bpm": "",
        "speed": "",
        "offset": ""
      },
      "patterns" : [],
      "bullets" : [],
      "triggers" : []
    };
    songSelected();
    patternHistory = [];
  }
};

const settingsInput = (v, e) => {
  switch(v) {
    case 'x':
    case 'y':
      if(isNaN(Number(e.value))) {
        if(e.value != '-') {
          alert("Input value is not number.");
        }
      } else if(Number(e.value) > 100) {
        alert("Input value is too high.");
      } else if(Number(e.value) < -100) {
        alert("Input value is too low.");
      } else {
        pattern.patterns[selectedCntElement.i][v] = Number(e.value);
        patternChanged();
        return;
      }
      e.value = pattern.patterns[selectedCntElement.i][v];
      break;
    case 'Timing':
      if(isNaN(Number(e.value))) {
        alert("Input value is not number.");
      } else if(Number(e.value) < 0) {
        alert("Input value is too low.");
      } else {
        if(selectedCntElement.v1 == 0) {
          pattern.patterns[selectedCntElement.i].ms = Number(e.value);
          pattern.patterns.sort(sortAsTiming);
          patternChanged();
        } else if(selectedCntElement.v1 == 1) {
          pattern.bullets[selectedCntElement.i].ms = Number(e.value);
          pattern.bullets.sort(sortAsTiming);
          patternChanged();
        } else if(selectedCntElement.v1 == 2) {
          pattern.triggers[selectedCntElement.i].ms = Number(e.value);
          pattern.triggers.sort(sortAsTiming);
          patternChanged();
        }
      }
      if(selectedCntElement.v1 == 0) {
        e.value = pattern.patterns[selectedCntElement.i].ms.toFixed();
      } else if(selectedCntElement.v1 == 1) {
        e.value = pattern.bullets[selectedCntElement.i].ms.toFixed();
      } else if(selectedCntElement.v1 == 2) {
        e.value = pattern.triggers[selectedCntElement.i].ms.toFixed();
      }
      break;
    case 'Side':
      if(e.value.toUpperCase() == 'L' || e.value.toUpperCase() == 'LEFT') {
        pattern.bullets[selectedCntElement.i].direction = 'L';
        patternChanged();
      } else if(e.value.toUpperCase() == 'R' || e.value.toUpperCase() == 'RIGHT') {
        pattern.bullets[selectedCntElement.i].direction = 'R';
        patternChanged();
      } else if(e.value == '') {
        if(pattern.bullets[selectedCntElement.i].direction == 'L') {
          pattern.bullets[selectedCntElement.i].direction = 'R';
        } else {
          pattern.bullets[selectedCntElement.i].direction = 'L';
        }
        patternChanged();
      } else {
        if(pattern.bullets[selectedCntElement.i].direction == 'R') {
          pattern.bullets[selectedCntElement.i].direction = 'L';
          patternChanged();
        }
        alert("Input is wrong value.");
      }
      e.value = pattern.bullets[selectedCntElement.i].direction;
      break;
    case 'Location':
      if(isNaN(Number(e.value))) {
        if(e.value != '-') {
          alert("Input value is not number.");
        }
      } else if(Number(e.value) > 100) {
        alert("Input value is too high.");
      } else if(Number(e.value) < -100) {
        alert("Input value is too low.");
      } else {
        pattern.bullets[selectedCntElement.i].location = Number(e.value);
        patternChanged();
        return;
      }
      e.value = pattern.bullets[selectedCntElement.i].location;
      break;
    case 'Angle':
      if(isNaN(Number(e.value))) {
        if(e.value != '-') {
          alert("Input value is not number.");
        }
      } else {
        pattern.bullets[selectedCntElement.i].angle = Number(e.value);
        patternChanged();
        return;
      }
      e.value = pattern.bullets[selectedCntElement.i].angle;
      break;
    case 'Speed':
      let element;
      if(selectedCntElement.v1 == 0) {
        element = pattern.patterns[selectedCntElement.i];
      } else if(selectedCntElement.v1 == 1) {
        element = pattern.bullets[selectedCntElement.i];
      } else {
        alert("Wrong Element.");
      }
      if(isNaN(Number(e.value))) {
        if(e.value != '-') {
          alert("Input value is not number.");
        }
      } else if(Number(e.value) > 5) {
        alert("Input value is too high.");
      } else if(Number(e.value) <= 0) {
        alert("Input value is too low.");
      } else {
        element.speed = Number(e.value);
        patternChanged();
        return;
      }
      e.value = element.speed;
      break;
    default:
      alert("settingsInput:Error");
  }
};

const triggersInput = (v, e) => {
  switch(v) {
    case 'x':
    case 'y':
      if(isNaN(Number(e.value))) {
        if(e.value != '-') {
          alert("Input value is not number.");
        }
      } else if(Number(e.value) > 100) {
        alert("Input value is too high.");
      } else if(Number(e.value) < -100) {
        alert("Input value is too low.");
      } else {
        pattern.triggers[selectedCntElement.i][v] = Number(e.value);
        patternChanged();
        return;
      }
      e.value = pattern.triggers[selectedCntElement.i][v];
      break;
    case 'num':
      if(isNaN(Number(e.value))) {
        alert("Input value is not number.");
      } else if(Number(e.value) > pattern.bullets.length || Number(e.value) < 0) {
        alert(`Bullet${e.value} is undefined.`);
      } else {
        pattern.triggers[selectedCntElement.i][v] = Number(e.value);
        patternChanged();
        return;
      }
      e.value = pattern.triggers[selectedCntElement.i][v];
      break;
    case 'bpm':
    case 'time':
      if(isNaN(Number(e.value))) {
        alert("Input value is not number.");
      } else if(Number(e.value) < 0) {
        alert("Input value must not be less than 0.");
      } else {
        pattern.triggers[selectedCntElement.i][v] = Number(e.value);
        patternChanged();
        return;
      }
      e.value = pattern.triggers[selectedCntElement.i][v];
      break;
    case 'opacity':
      if(isNaN(Number(e.value))) {
        alert("Input value is not number.");
      } else if(Number(e.value) < 0) {
        alert("Input value must not be less than 0.");
      } else if(Number(e.value) > 1) {
        alert("Input value must not be more than 1.");
      } else {
        pattern.triggers[selectedCntElement.i][v] = Number(e.value);
        patternChanged();
        return;
      }
      e.value = pattern.triggers[selectedCntElement.i][v];
      break;
    case 'speed':
      if(isNaN(Number(e.value))) {
        alert("Input value is not number.");
      } else if(Number(e.value) < 0) {
        alert("Input value must not be less than 0.");
      } else if(Number(e.value) > 5) {
        alert("Input value must not be more than 5.");
      } else {
        pattern.triggers[selectedCntElement.i][v] = Number(e.value);
        patternChanged();
        return;
      }
      e.value = pattern.triggers[selectedCntElement.i][v];
      break;
    case 'align':
      if(e.value == 'left' || e.value == 'center' || e.value == 'right') {
        pattern.triggers[selectedCntElement.i][v] = e.value;
        patternChanged();
        return;
      }
      alert("Input value should be 'left', 'center', or 'right'.");
      e.value = pattern.triggers[selectedCntElement.i][v];
      break;
    case 'size':
    case 'text':
      pattern.triggers[selectedCntElement.i][v] = e.value;
      patternChanged();
      break;
    default:
      alert("settingsInput:Error");
  }
};

const changeBPM = (e) => {
  if(isNaN(Number(e.value))) {
    alert("Input value is not number.");
  } else {
    bpm = Number(e.value);
    pattern.information.bpm = bpm;
    patternChanged();
  }
};

const changeSpeed = (e) => {
  if(isNaN(Number(e.value))) {
    alert("Input value is not number.");
  } else {
    if(Number(e.value) > 5) {
      alert("Input value is too high.");
    } else if(Number(e.value) <= 0) {
      alert("Input value is too low.");
    } else {
      speed = Number(e.value);
      pattern.information.speed = speed;
      patternChanged();
    }
  }
};

const changeOffset = (e) => {
  if(isNaN(Number(e.value))) {
    alert("Input value is not number.");
  } else {
    offset = Number(e.value);
    pattern.information.offset = offset;
    patternChanged();
  }
};

const trackMousePos = () => {
  const width = parseInt((componentView.offsetWidth - canvasContainer.offsetWidth) / 2 + menuContainer.offsetWidth);
  const height = navbar.offsetHeight;
  const x = (event.clientX - width) / canvasContainer.offsetWidth * 200 - 100;
  const y = (event.clientY - height) / canvasContainer.offsetHeight * 200 - 100;
  if(!(x < -100 || y < -100 || x > 100 || y > 100)) {
    mouseMode = 0;
    mouseX = x;
    mouseY = y;
  } else {
    mouseMode = -1;
  }
}

const trackTimelineMousePos = () => {
  mouseMode = 1;
  mouseX = event.clientX;
  mouseY = event.clientY - Math.floor(window.innerHeight / 100 * 73);
  //console.log(mouseX, mouseY);
}

const elementFollowMouse = (v1, v2, i) => {
  requestAnimationFrame(() => {
    if(mouseDown && (pointingCntElement.v1 !== '' || v1 != undefined)) {
      if(v1 == undefined) {
        v1 = pointingCntElement.v1;
        v2 = pointingCntElement.v2;
        i = pointingCntElement.i;
      }
      switch(v1) {
        case 0:
          if((mouseX <= 100 || mouseX >= -100) && (mouseY <= 100 || mouseY >= -100) && mouseMode == 0) {
            pattern.patterns[i].x = parseInt(mouseX);
            pattern.patterns[i].y = parseInt(mouseY);
          }
          break;
        case 1:
          if((mouseY <= 100 || mouseY >= -100) && mouseMode == 0) {
            const seek = song.seek();
            const left = pattern.bullets[i].direction == 'L';
            const p = (seek * 1000 - pattern.bullets[i].ms) / (bpm * 40 / speed / pattern.bullets[i].speed) * 100;
            const y = mouseY - p * getTan(circleBulletAngles[i] != undefined ? circleBulletAngles[i] : pattern.bullets[i].angle) * (left ? 1 : -1);
            pattern.bullets[i].location = y;
          }
          break;
      }
      lastMovedMs = Date.now();
      setTimeout(() => {
        if(Date.now() - lastMovedMs >= 100 && lastMovedMs != -1) {
          lastMovedMs = -1;
          patternChanged();
        }
      }, 100);
      elementFollowMouse(v1, v2, i);
      changeSettingsMode(v1, v2, i);
    }
  });
};

const compClicked = () => {
  if(mode == 0) {
    elementFollowMouse();
  } else if(mode == 1) {
    if(pointingCntElement.v1 !== '') {
      if(JSON.stringify(pointingCntElement) == JSON.stringify(selectedCntElement)) {
        changeSettingsMode(-1);
        if(isSettingsOpened) toggleSettings();
        selectedCntElement = {"v1": '', "v2": '', "i": ''};
      } else {
        let selectedElement;
        switch(pointingCntElement.v1) {
          case 0:
            selectedElement = pattern.patterns[pointingCntElement.i];
            break;
          case 1:
            selectedElement = pattern.bullets[pointingCntElement.i];
            break;
          default:
            console.log("compClicked:Error");
        }
        changeSettingsMode(pointingCntElement.v1, pointingCntElement.v2, pointingCntElement.i);
        if(!isSettingsOpened) toggleSettings();
        selectedCntElement = pointingCntElement;
      }
    } else {
      changeSettingsMode(-1);
      if(isSettingsOpened) toggleSettings();
      selectedCntElement = {"v1": '', "v2": '', "i": ''};
    }
  } else if(mode == 2) {
    const seek = song.seek() - (offset + sync) / 1000;
    if(mouseX < -80 || mouseX > 80) {
      let newElement = {"ms": parseInt(seek * 1000), "value": selectedValue, "direction": (mouseX < -80 ? "L" : "R"), "location": parseInt(mouseY), "angle": 0, "speed": 2};
      pattern.bullets.push(newElement);
      pattern.bullets.sort(sortAsTiming);
      patternChanged();
      for(let i = 0; i < pattern.bullets.length; i++) {
        if(JSON.stringify(pattern.bullets[i]) == JSON.stringify(newElement)) {
          selectedCntElement = {"v1": 1, "v2": selectedValue, "i": i};
        }
      }
    } else {
      let newElement = {"ms": parseInt(seek * 1000) + 1, "value": 0, "x": parseInt(mouseX), "y" : parseInt(mouseY)};
      pattern.patterns.push(newElement);
      pattern.patterns.sort(sortAsTiming);
      patternChanged();
      for(let i = 0; i < pattern.patterns.length; i++) {
        if(JSON.stringify(pattern.patterns[i]) == JSON.stringify(newElement)) {
          selectedCntElement = {"v1": 0, "v2": 0, "i": i};
        }
      }
    }
    changeSettingsMode(selectedCntElement.v1, selectedCntElement.v2, selectedCntElement.i);
    if(!isSettingsOpened) toggleSettings();
  }
}

const changeSettingsMode = (v1, v2, i) => {
  trackSettings.style.display = 'none';
  elementsSettings.style.display = 'block';
  switch(v1) {
    case -1:
      trackSettings.style.display = 'block';
      elementsSettings.style.display = 'none';
      document.getElementById("dot").style.color = '#9d4ec2';
      document.getElementById("settingsNameSpace").innerText = 'Settings';
      document.getElementById("trackSettings").style.display = 'block';
      document.getElementById("elementsSettings").style.display = 'none';
      break;
    case 0:
      document.getElementById("dot").style.color = '#f59b42';
      document.getElementById("settingsNameSpace").innerText = `Note_${i}`;
      document.getElementById("trackSettings").style.display = 'none';
      document.getElementById("elementsSettings").style.display = 'block';
      document.getElementById("noteSettingsContainer").style.display = 'block';
      document.getElementById("bulletSettingsContainer").style.display = 'none';
      document.getElementById("triggerSettingsContainer").style.display = 'none';
      document.getElementById("triggerInitializeContainer").style.display = 'none';
      noteSettingsContainer.getElementsByClassName("settingsPropertiesTextbox")[0].value = pattern.patterns[i].x;
      noteSettingsContainer.getElementsByClassName("settingsPropertiesTextbox")[1].value = pattern.patterns[i].y;
      noteSettingsContainer.getElementsByClassName("settingsPropertiesTextbox")[2].value = pattern.patterns[i].ms.toFixed();
      break;
    case 1:
      document.getElementById("noteSettingsContainer").style.display = 'none';
      document.getElementById("triggerSettingsContainer").style.display = 'none';
      document.getElementById("bulletSettingsContainer").style.display = 'block';
      document.getElementById("triggerInitializeContainer").style.display = 'none';
      bulletSettingsContainer.getElementsByClassName("settingsPropertiesTextbox")[0].value = pattern.bullets[i].direction;
      bulletSettingsContainer.getElementsByClassName("settingsPropertiesTextbox")[1].value = pattern.bullets[i].location;
      bulletSettingsContainer.getElementsByClassName("settingsPropertiesTextbox")[3].value = pattern.bullets[i].ms.toFixed();
      bulletSettingsContainer.getElementsByClassName("settingsPropertiesTextbox")[4].value = pattern.bullets[i].speed;
      switch(v2) {
        case 0:
          document.getElementById("dot").style.color = '#6fdef7';
          bulletSettingsContainer.getElementsByClassName("settingsPropertiesIndividual")[2].style.display = 'flex';
          bulletSettingsContainer.getElementsByClassName("settingsPropertiesTextbox")[2].value = pattern.bullets[i].angle;
          break;
        case 1:
          document.getElementById("dot").style.color = '#575cf2';
          bulletSettingsContainer.getElementsByClassName("settingsPropertiesIndividual")[2].style.display = 'none';
          break;
        default:
          alert("changeSettingsMode:Error");
      }
      document.getElementById("settingsNameSpace").innerText = `Bullet_${i}`;
      break;
    case 2:
      document.getElementById("settingsNameSpace").innerText = `Trigger_${i}`;
      document.getElementById("dot").style.color = '#36bf24';
      document.getElementById("trackSettings").style.display = 'none';
      document.getElementById("elementsSettings").style.display = 'block';
      document.getElementById("noteSettingsContainer").style.display = 'none';
      document.getElementById("bulletSettingsContainer").style.display = 'none';
      document.getElementById("triggerSettingsContainer").style.display = 'block';
      document.getElementById("triggerInitializeContainer").style.display = 'none';
      triggerSelectBox.selectedIndex = pattern.triggers[selectedCntElement.i].value;
      if(v2 == -1) {
        document.getElementById("triggerSettingsContainer").style.display = 'none';
        document.getElementById("triggerInitializeContainer").style.display = 'block';
      } else {
        let properties = triggerSettingsContainer.getElementsByClassName('settingsPropertiesContainer');
        let start = 1;
        for(let j = start; properties.length - start > j; j++) {
          properties[j].style.display = 'none';
          if(j - start == v2) {
            properties[j].style.display = 'block';
            properties[j].getElementsByClassName('settingsPropertiesTextbox')[0].value = pattern.triggers[i].ms;
          }
        }
      }
      break;
    default:
      alert("changeSettingsMode:Error");
  }
}

const triggerSet = (isChanged) => {
  pattern.triggers[selectedCntElement.i].value = (isChanged ? triggerSelectBox : triggerInitBox).selectedIndex - (isChanged ? 0 : 1);
  changeSettingsMode(2, (isChanged ? triggerSelectBox : triggerInitBox).selectedIndex - (isChanged ? 0 : 1), selectedCntElement.i);
};

const zoomIn = () => {
  zoom -= 0.15;
};

const zoomOut = () => {
  zoom += 0.15;
};

const playPauseBtn = () => {
  songPlayPause();
};

const stopBtn = () => {
  document.getElementById('controlBtn').classList.add('timeline-play');
  document.getElementById('controlBtn').classList.remove('timeline-pause');
  song.stop();
};

const changeRate = () => {
  rate += 0.25;
  if(rate > 2) {
    rate = 0.25;
  }
  document.getElementById('percentage').innerText = `${rate * 100}%`;
  song.rate(rate);
};

const test = () => {
  alert(need2Save);
  save();
  let trackSettingsForm = trackSettings.getElementsByClassName('settingsPropertiesTextbox');
  pattern.information = {
    "version": "1.0",
    "track": trackSettingsForm[0].value,
    "producer": trackSettingsForm[1].value,
    "author": trackSettingsForm[2].value,
    "bpm": bpm,
    "speed": speed,
    "offset": offset
  };
  window.location.href = `${url}/test?pattern=${JSON.stringify(pattern)}`;
};

const changeSplit = () => {
  split++;
  if(split == 5) {
    split = 6;
  } else if(split == 7) {
    split = 8;
  } else if(split == 9) {
    split = 12;
  } else if(split == 13) {
    split = 16;
  } else if(split == 17) {
    split = 1;
  }
  document.getElementById('split').innerText = `1/${split}`;
};

const deleteElement = () => {
  if(selectedCntElement.v1 == 0) {
    delete pattern.patterns[selectedCntElement.i];
    pattern.patterns.length--;
    pattern.patterns.sort(sortAsTiming);
  } else if(selectedCntElement.v1 == 1) {
    delete pattern.bullets[selectedCntElement.i];
    pattern.bullets.length--;
    pattern.bullets.sort(sortAsTiming);
  }
  patternChanged();
  changeSettingsMode(-1);
  selectedCntElement = {"v1": '', "v2": '', "i": ''};
  if(isSettingsOpened) toggleSettings();
};

const patternChanged = () => {
  if(patternSeek != patternHistory.length - 1) {
    patternHistory.splice(patternSeek + 1, patternHistory.length - 1 - patternSeek);
  }
  patternHistory.push(eval(`(${JSON.stringify(pattern)})`));
  if(patternHistory.length > 50) {
    patternHistory.splice(0, patternHistory.length - 50);
  }
  patternSeek = patternHistory.length - 1;
};

const patternUndo = () => {
  if(patternSeek >= 1) {
    patternSeek--;
    pattern = eval(`(${JSON.stringify(patternHistory[patternSeek])})`);
  }
  selectedCntElement = {"i": '', "v1": '', "v2": ''};
  if(isSettingsOpened) toggleSettings();
};

const patternRedo = () => {
  if(patternSeek < patternHistory.length - 1) {
    patternSeek++;
    pattern = eval(`(${JSON.stringify(patternHistory[patternSeek])})`);
  }
  selectedCntElement = {"i": '', "v1": '', "v2": ''};
  if(isSettingsOpened) toggleSettings();
};

const elementCopy = () => {
  copiedElement.v1 = selectedCntElement.v1;
  if(selectedCntElement.v1 == 0) {
    copiedElement.element = eval(`(${JSON.stringify(pattern.patterns[selectedCntElement.i])})`);
  } else if(selectedCntElement.v1 == 1) {
    copiedElement.element = eval(`(${JSON.stringify(pattern.bullets[selectedCntElement.i])})`);
  } else if(selectedCntElement.v1 == 2) {
    copiedElement.element = eval(`(${JSON.stringify(pattern.triggers[selectedCntElement.i])})`);
  }
};

const elementPaste = () => {
  copiedElement.element.ms = song.seek() * 1000;
  let searchTarget = '';
  if(copiedElement.v1 == 0) {
    pattern.patterns.push(eval(`(${JSON.stringify(copiedElement.element)})`));
    pattern.patterns.sort(sortAsTiming);
    searchTarget = pattern.patterns;
  } else if(copiedElement.v1 == 1) {
    pattern.bullets.push(eval(`(${JSON.stringify(copiedElement.element)})`));
    pattern.bullets.sort(sortAsTiming);
    searchTarget = pattern.bullets;
  } else if(copiedElement.v1 == 2) {
    pattern.triggers.push(eval(`(${JSON.stringify(copiedElement.element)})`));
    pattern.triggers.sort(sortAsTiming);
    searchTarget = pattern.triggers;
  }
  for(let i = 0; i < searchTarget.length; i++) {
    if(JSON.stringify(searchTarget[i]) == JSON.stringify(copiedElement.element)) {
      selectedCntElement = {"i": i, "v1": copiedElement.v1, "v2": searchTarget.value};
    }
  }
  if(!isSettingsOpened) toggleSettings();
  changeSettingsMode(selectedCntElement.v1, selectedCntElement.v2, selectedCntElement.i); 
  patternChanged();
};

const showHelp = () => {
  document.getElementById('helpContainer').style.display = 'flex';
};

const hideHelp = () => {
  document.getElementById('helpContainer').style.display = 'none';
};

const tmlScrollLeft = () => {
  song.seek(song.seek() - 0.01);
  let seek = song.seek();
  song.seek(seek - (seek % (60 / bpm / split)));
};

const tmlScrollRight = () => {
  song.seek(song.seek() + 0.01);
  let seek = song.seek();
  song.seek(seek + (60 / bpm / split) - (seek % (60 / bpm / split)));
  if(song.seek() >= song._duration) {
    song.seek(seek - (60 / bpm / split) + (seek % (60 / bpm / split)) - 0.01);
  }
};

const tmlScrollUp = () => {
  timelineYLoc = Number(timelineYLoc.toFixed(2)) + tmlCanvas.height / 9;
  timelineScrollCount--;
  if(timelineYLoc > 1) {
    timelineYLoc = Number(timelineYLoc.toFixed(2)) - tmlCanvas.height / 9;
    timelineScrollCount++;
  }
};

const tmlScrollDown = () => {
  if(timelineElementNum > 6 && timelineScrollCount < timelineElementNum) {
    timelineYLoc = Number(timelineYLoc.toFixed(2)) - tmlCanvas.height / 9;
    timelineScrollCount++;
  }
};

const scrollEvent = e => {
  e = window.event || e;
  let delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
  if(delta == 1) { //UP
    if(ctrlDown) tmlScrollUp();
    else tmlScrollLeft();
  } else { //DOWN
    if(ctrlDown) tmlScrollDown();
    else tmlScrollRight();
  }
  e.preventDefault();
};

document.getElementById('timelineContainer').addEventListener("mousewheel", scrollEvent);
document.getElementById('timelineContainer').addEventListener("DOMMouseScroll", scrollEvent);
window.addEventListener("resize", initialize);

window.addEventListener("beforeunload", e => {
  (e || window.event).returnValue = rusure;
  return rusure;
});

document.onkeyup = e => {
  e = e || window.event;
  if(e.keyCode == 17) { //CTRL
    ctrlDown = false;
  } else if(e.keyCode == 16) { //SHIFT
    shiftDown = false;
  } else if(e.keyCode == 112) { //F1
    hideHelp();
  }
};

document.onkeydown = e => {
  e = e || window.event;
  if(e.keyCode == 32) { //Space
    songPlayPause();
  } else if(e.keyCode == 27) { //Esc
    if(isSettingsOpened) {
      selectedCntElement = {"v1": '', "v2": '', "i": ''};
      changeSettingsMode(-1);
      toggleSettings();
    } else {
      if(song.playing()){
        songPlayPause();
      } else {
        timelineScrollCount = 0;
        timelineYLoc = 0;
        song.stop();
      }
    }
  } else if(e.keyCode == 49) { //1
    if(ctrlDown) {
      e.preventDefault();
      changeMode(0);
      return;
    }
  } else if(e.keyCode == 50) { //2
    if(ctrlDown) {
      e.preventDefault();
      changeMode(1);
      return;
    }
  } else if(e.keyCode == 51) { //3
    if(ctrlDown) {
      e.preventDefault();
      changeMode(2);
      return;
    }
  } else if(e.keyCode == 37) { //LEFT
    tmlScrollLeft();
  } else if(e.keyCode == 39) { //RIGHT
    tmlScrollRight();
  } else if(e.keyCode == 38) { //UP
    tmlScrollUp();
  } else if(e.keyCode == 40) { //DOWN
    tmlScrollDown();
  } else if(e.keyCode == 46) { //DELETE
    if(ctrlDown) {
      if(shiftDown) {
        e.preventDefault();
        deleteAll();
        return;
      }
    }
    deleteElement();
  } else if(e.keyCode == 17) { //CTRL
    ctrlDown = true;
  } else if(e.keyCode == 16) { //SHIFT
    shiftDown = true;
  } else if(e.keyCode == 83) { //S
    if(ctrlDown) {
      e.preventDefault();
      save();
    }
  } else if(e.keyCode == 90) { //Z
    if(ctrlDown) {
      if(shiftDown) {
        patternRedo();
      } else {
        patternUndo();
      }
    }
  } else if(e.keyCode == 67) { //C
    if(ctrlDown) {
      elementCopy();
    }
  } else if(e.keyCode == 80) { //P
    if(ctrlDown) {
      e.preventDefault();
      test();
    }
  } else if(e.keyCode == 86) { //V
    if(ctrlDown) {
      elementPaste();
    }
  } else if(e.keyCode == 84) { //T
    pattern.triggers.push({"ms": song.seek() * 1000, "value": -1});
    pattern.triggers.sort(sortAsTiming);
    for(let i = 0; i < pattern.triggers.length; i++) {
      if(JSON.stringify(pattern.triggers[i]) == `{"ms":${song.seek() * 1000},"value":-1}`) {
        selectedCntElement = {"i": i, "v1": 2, "v2": -1};
        patternChanged();
        changeSettingsMode(selectedCntElement.v1, selectedCntElement.v2, selectedCntElement.i);
        if(!isSettingsOpened) toggleSettings();
        return;
      }
    }
  } else if(e.keyCode == 112) { //F1
    e.preventDefault();
    showHelp();
  } else if(e.keyCode == 113) { //F2, for test
    song.stop();
    pattern = {
      "information": {
        "version": "1.0",
        "track": "",
        "producer": "",
        "author": "",
        "bpm": "",
        "speed": "",
        "offset": ""
      },
      "patterns" : [
        {"ms": 60/bpm*1000, "value": 0, "x": -50, "y" : -50},
        {"ms": 60/bpm*2000, "value": 0, "x": 0, "y" : -50},
        {"ms": 60/bpm*3000, "value": 0, "x": 50, "y" : -50},
        {"ms": 60/bpm*4000, "value": 0, "x": -50, "y" : 50},
        {"ms": 60/bpm*21000, "value": 0, "x": -50, "y" : -50},
        {"ms": 60/bpm*22000, "value": 0, "x": 0, "y" : -50},
        {"ms": 60/bpm*23000, "value": 0, "x": 50, "y" : -50},
        {"ms": 60/bpm*24000, "value": 0, "x": -50, "y" : 50},
        {"ms": 60/bpm*25000, "value": 0, "x": 0, "y" : 50},
        {"ms": 60/bpm*26000, "value": 0, "x": 50, "y" : 50},
        {"ms": 60/bpm*27000, "value": 0, "x": 0, "y" : 0},
        {"ms": 60/bpm*28000, "value": 0, "x": -50, "y" : 50},
        {"ms": 60/bpm*29000, "value": 0, "x": 0, "y" : 50},
        {"ms": 60/bpm*30000, "value": 0, "x": 50, "y" : 50},
        {"ms": 60/bpm*31000, "value": 0, "x": 0, "y" : 0},
        {"ms": 60/bpm*32000, "value": 0, "x": 50, "y" : 50},
        {"ms": 60/bpm*33000, "value": 0, "x": 0, "y" : 0},
        {"ms": 60/bpm*34000, "value": 0, "x": 50, "y" : 50},
        {"ms": 60/bpm*35000, "value": 0, "x": 0, "y" : 0},
        {"ms": 60/bpm*36000, "value": 0, "x": 0, "y" : 50},
        {"ms": 60/bpm*37000, "value": 0, "x": 50, "y" : 50},
        {"ms": 60/bpm*38000, "value": 0, "x": 0, "y" : 0},
        {"ms": 60/bpm*39000, "value": 0, "x": 50, "y" : 50},
        {"ms": 60/bpm*40000, "value": 0, "x": 0, "y" : 0},
        {"ms": 60/bpm*41000, "value": 0, "x": 50, "y" : 50},
        {"ms": 60/bpm*42000, "value": 0, "x": 0, "y" : 0},
      ],
      "bullets" : [
        {"ms": 60/bpm*1000, "value": 0, "direction": "L", "location": 0, "angle": 0, "speed": 2},
        {"ms": 60/bpm*1000, "value": 0, "direction": "R", "location": 0, "angle": 0, "speed": 2},
        {"ms": 60/bpm*3000, "value": 0, "direction": "L", "location": 0, "angle": 30, "speed": 2},
        {"ms": 60/bpm*3000, "value": 0, "direction": "R", "location": 0, "angle": 30, "speed": 2},
        {"ms": 60/bpm*5000, "value": 0, "direction": "L", "location": 0, "angle": 45, "speed": 2},
        {"ms": 60/bpm*5000, "value": 0, "direction": "R", "location": 0, "angle": 45, "speed": 2},
        {"ms": 60/bpm*7000, "value": 0, "direction": "L", "location": 0, "angle": 60, "speed": 2},
        {"ms": 60/bpm*7000, "value": 0, "direction": "R", "location": 0, "angle": 60, "speed": 2},
        {"ms": 60/bpm*9000, "value": 0, "direction": "L", "location": 0, "angle": 75, "speed": 1},
        {"ms": 60/bpm*9000, "value": 0, "direction": "R", "location": 0, "angle": 75, "speed": 1},
        {"ms": 60/bpm*10000, "value": 1, "direction": "L", "location": 0, "speed": 1},
        {"ms": 60/bpm*10000, "value": 1, "direction": "R", "location": 0, "speed": 1},
        {"ms": 60/bpm*12000, "value": 1, "direction": "L", "location": 0, "speed": 2},
        {"ms": 60/bpm*12000, "value": 1, "direction": "R", "location": 0, "speed": 2},
        {"ms": 60/bpm*14000, "value": 1, "direction": "L", "location": 0, "speed": 3},
        {"ms": 60/bpm*14000, "value": 1, "direction": "R", "location": 0, "speed": 3},
        {"ms": 60/bpm*16000, "value": 1, "direction": "L", "location": 0, "speed": 4},
        {"ms": 60/bpm*16000, "value": 1, "direction": "R", "location": 0, "speed": 4},
        {"ms": 60/bpm*18000, "value": 1, "direction": "L", "location": 0, "speed": 5},
        {"ms": 60/bpm*18000, "value": 1, "direction": "R", "location": 0, "speed": 5},
        {"ms": 60/bpm*21000, "value": 0, "direction": "L", "location": 0, "angle": 0, "speed": 2},
        {"ms": 60/bpm*21000, "value": 0, "direction": "L", "location": 0, "angle": -30, "speed": 3},
        {"ms": 60/bpm*21000, "value": 0, "direction": "L", "location": 0, "angle": -45, "speed": 4},
        {"ms": 60/bpm*21000, "value": 0, "direction": "L", "location": 0, "angle": 30, "speed": 3},
        {"ms": 60/bpm*21000, "value": 0, "direction": "L", "location": 0, "angle": 45, "speed": 4},
        {"ms": 60/bpm*21000, "value": 0, "direction": "R", "location": 0, "angle": 0, "speed": 2},
        {"ms": 60/bpm*21000, "value": 0, "direction": "R", "location": 0, "angle": -30, "speed": 3},
        {"ms": 60/bpm*21000, "value": 0, "direction": "R", "location": 0, "angle": -45, "speed": 4},
        {"ms": 60/bpm*21000, "value": 0, "direction": "R", "location": 0, "angle": 30, "speed": 3},
        {"ms": 60/bpm*21000, "value": 0, "direction": "R", "location": 0, "angle": 45, "speed": 4},
      ],
      "triggers" : [
        {"ms": 60/bpm*4000, "value": 2, "bpm": 90},
        {"ms": 60/bpm*4000, "value": 5, x: -90, y: -90, align: "left", "text": "bpm:90", "time": 60/bpm*4000, "size": "16px"},
        {"ms": 60/bpm*8000, "value": 2, "bpm": 180},
        {"ms": 60/bpm*8000, "value": 5, x: -90, y: -90, align: "left", "text": "bpm:180", "time": 60/bpm*3000, "size": "16px"},
        {"ms": 60/bpm*11000, "value": 0, "num": 10},
        {"ms": 60/bpm*11000, "value": 5, x: -90, y: -90, align: "left", "text": "destroy:10", "time": 60/bpm*2000, "size": "16px"},
        {"ms": 60/bpm*13000, "value": 0, "num": 13},
        {"ms": 60/bpm*13000, "value": 5, x: -90, y: -90, align: "left", "text": "destroy:13", "time": 60/bpm*4000, "size": "16px"},
        {"ms": 60/bpm*21000, "value": 5, x: 0, y: 0, align: "right", "text": "JUST TEXT", "time": 60/bpm*4000, "size": "16px"},
        {"ms": 60/bpm*21000, "value": 5, x: 0, y: 0, align: "left", "text": "AND TEST", "time": 60/bpm*6000, "size": "32px"},
        {"ms": 60/bpm*21000, "value": 5, x: -90, y: -90, align: "left", "text": "text(2)", "time": 60/bpm*2000, "size": "16px"},
        {"ms": 60/bpm*23000, "value": 1},
        {"ms": 60/bpm*23000, "value": 5, x: -90, y: -90, align: "left", "text": "destroyAll", "time": 60/bpm*2000, "size": "16px"},
        {"ms": 60/bpm*25000, "value": 4, "speed": 4},
        {"ms": 60/bpm*25000, "value": 5, x: -90, y: -90, align: "left", "text": "speed:4", "time": 60/bpm*4000, "size": "16px"},
        {"ms": 60/bpm*29000, "value": 4, "speed": 2},
        {"ms": 60/bpm*29000, "value": 5, x: -90, y: -90, align: "left", "text": "speed:2", "time": 60/bpm*1000, "size": "16px"},
        {"ms": 60/bpm*30000, "value": 3, "opacity": 0.5},
        {"ms": 60/bpm*30000, "value": 5, x: -90, y: -90, align: "left", "text": "opacity:0.5", "time": 60/bpm*2000, "size": "16px"},
        {"ms": 60/bpm*32000, "value": 3, "opacity": 0.1},
        {"ms": 60/bpm*32000, "value": 5, x: -90, y: -90, align: "left", "text": "opacity:0.1", "time": 60/bpm*2000, "size": "16px"},
        {"ms": 60/bpm*34000, "value": 3, "opacity": 1},
        {"ms": 60/bpm*34000, "value": 5, x: -90, y: -90, align: "left", "text": "opacity:1", "time": 60/bpm*4000, "size": "16px"},
      ]
    };
    songSelected();
  }
  if(mode == 2) {
    if(e.keyCode == 49) { //1
      selectedValue = 0;
    } else if(e.keyCode == 50) { //2
      selectedValue = 1;
    }
  }
};

document.body.onmousedown = () => { 
  mouseDown = true;
}

document.body.onmouseup = () => {
  mouseDown = false;
}