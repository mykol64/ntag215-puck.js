// Constants
const SAVE_TO_FLASH = true; // Set this to true if you want to save the tags to flash memory.
const FIRMWARE_NAME = "dtm-1.0.1";
const PUCK_NAME_FILE = "PIXL";
const BOARD = process.env.BOARD;
const UART_WINDOW = 5000; // How long in miliseconds during power on in which you can press the button to enable UART.
const POWER_ON_TIME = 5000; // How many miliseconds you have to hold the button to power on the puck
const POWER_OFF_TIME = 5000;// How many miliseconds you have to hold the button to power off the puck

// Bluetooth GUIDs
const BLE_SERVICE_ID = "78290001-d52e-473f-a9f4-f03da7c67dd1";
const BLE_COMMAND_CHARACTERISTIC = "78290002-d52e-473f-a9f4-f03da7c67dd1";
const BLE_RETURN_CHARACTERISTIC = "78290003-d52e-473f-a9f4-f03da7c67dd1";
const BLE_NAME_CHARACTERISTIC = "78290004-d52e-473f-a9f4-f03da7c67dd1";
const BLE_FIRMWARE_CHARACTERISTIC = "78290005-d52e-473f-a9f4-f03da7c67dd1";

// Modules
const storage = require("Storage");


// Mangle Helper
const _NTAG215 = this.NTAG215;
const _clearTimeout = clearTimeout;
const _setTimeout = setTimeout;
const _setWatch = setWatch;
const _clearWatch = clearWatch;
const _consoleLog = console.log;
const _Math = Math;
const _MathRound = _Math.round;
const _MathRandom = _Math.random;
const _Rising = "rising";
const _Falling = "falling";



var _BACKLIGHT_ON = false;
var _LCD_ON = true;
var _NFC_STATUS = "ON";


var _LED1 = this.LED1;
var _BTN1 = this.BTN1;
var _BTN2 = this.BTN2;
var _BTN3 = this.BTN3;
var _BTN4 = this.BTN4;

// Variables
var currentTag = 0;
var changeTagTimeout = null;
var enableUart = false;
var txBuffer = new Uint8Array(32);
var tags = [];
var currentCharacter = "";
var currentGameSeries = "";
var currentAmiiboSeries = "";
var currentId = "";

while (tags.length < 50 && process.memory().free > 1024) {
  tags.push(new Uint8Array(572));
}


function getBatterPercent() {
  return E.getBattery();
}

function updateScreen() {
  g.clear();
  g.drawString("Battery:" + getBatterPercent() + "%", 80, 0);
  g.drawString("NFC:" + _NFC_STATUS, 0, 0);
  g.drawString("Slot:" + (currentTag + 1) + "/" + tags.length, 35, 0);
  g.drawString(currentId, 0, 20);
  g.drawString(currentCharacter, 0, 30);
  g.drawString(currentGameSeries, 0, 40);
  g.drawString(currentAmiiboSeries, 0, 50);
  g.flip();
}

function toggleScreen() {
  if (_LCD_ON && !_BACKLIGHT_ON) {
    _LED1.set();
    _BACKLIGHT_ON = true;
  } else if (!_LCD_ON && !_BACKLIGHT_ON) {
    Pixl.setLCDPower(true);
    _LCD_ON = true;
    updateScreen();
  } else {
    _LED1.reset();
    _BACKLIGHT_ON = false;
    Pixl.setLCDPower(false);
    _LCD_ON = false;
  }
}

function toHexString(byteArray) {
  return byteArray.reduce((output, elem) =>
    (output + ('0' + elem.toString(16)).slice(-2)), '');
}

function fixUid() {
  if (tags[currentTag][0] == 0x04 && tags[currentTag][9] == 0x48 && _NTAG215.fixUid()) {
    //_consoleLog("Fixed UID");
    return true;
  }

  return false;
}



updateScreen();


function getTagInfo(slot) {
  var output = Uint8Array(80);
  output.set(tags[slot].slice(0, 8), 0);
  output.set(tags[slot].slice(16, 24), 8);
  output.set(tags[slot].slice(32, 52), 20);
  output.set(tags[slot].slice(84, 92), 40);
  output.set(tags[slot].slice(96, 128), 48);

  return output;
}

function changeTag(slot, noDelay) {
  var barray = getTagInfo(slot);
  var head = toHexString(barray.slice(40, 44));
  var tail = toHexString(barray.slice(44, 48));
  var id = head + tail;
  var amiiboseries = "Unknow";
  var character = "Unknown";
  var gameseries = "Unknow";
  if (id != "0000000000000000") {
    var amiibo_filename = require("Storage").readJSON("series_map.json", true);
    var amiibo_json = null;
    var splitline = null;
    var series_map = amiibo_filename[tail.slice(4, 6)];
    amiibo_filename = null;
    if (series_map != "acc") {
      amiibo_json = require("Storage").readJSON(series_map + ".json", true);
      ////_consoleLog(amiibo_json);
      // splitline = amiibo_json[head.slice(0,4)].split(",");
      splitline = amiibo_json[id].split(",");
      amiibo_json = null;
    }

    if (series_map == "acc") {
      amiiboseries = "Animal Crossing";
      character = "Animal Crossing";
      gameseries = "Animal Crossing";
    } else {
      amiiboseries = splitline[0];
      character = splitline[1];
      gameseries = splitline[2];
    }
  }

  currentCharacter = character;
  currentAmiiboSeries = amiiboseries;
  currentGameSeries = gameseries;
  currentId = id;


  _NTAG215.nfcStop();

  currentTag = slot;


  function innerChangeTag() {

    _NTAG215.setTagData(tags[slot].buffer);
    fixUid();
    _NTAG215.nfcStart();

    updateScreen();
  }

  if (noDelay) {
    innerChangeTag();
  } else {
    changeTagTimeout = _setTimeout(innerChangeTag, 200);
  }
}

//function cycleTags() {
//  changeTag(++currentTag >= 7 ? 0 : currentTag);
//}

function cycleTagsUp() {
  changeTag(++currentTag >= tags.length ? 0 : currentTag);
}

function cycleTagsDown() {
  changeTag(--currentTag < 0 ? (tags.length - 1) : currentTag);
}

function getBufferClone(buffer) {
  if (buffer) {
    var output = new Uint8Array(buffer.length);
    output.set(buffer);

    return output;
  }
}

function saveTag(slot) {
  if (slot == undefined) {
    slot = currentTag;
  }

  if (slot < 0 || slot >= tags.length) {
    return;
  }

  //_consoleLog("Saving tag " + slot);
  storage.write("tag" + slot + ".bin", tags[slot]);
}

function saveAllTags() {
  for (var i = 0; i < tags.length; i++) {
    saveTag(i);
  }
}

function setUartWatch() {
  NRF.setServices({}, {
    uart: true
  });

  enableUart = false;

  _setWatch(() => {
    enableUart = true;

  }, _BTN1, {
    repeat: false,
    edge: _Rising,
    debounce: 50
  });

  _setTimeout(initialize, UART_WINDOW);
}

function powerOn() {
  _NFC_STATUS = "ON";
  updateScreen();
  NRF.wake();
  setUartWatch();
}

function setInitWatch() {
  _setWatch(powerOn, _BTN1, {
    repeat: false,
    edge: _Rising,
    debounce: POWER_ON_TIME
  });

  _setWatch(toggleScreen, _BTN3, {
    repeat: true,
    edge: _Falling,
    debounce: 50
  });
}

function powerOff() {
  _clearWatch();
  setInitWatch();
  NRF.sleep();
  _NTAG215.nfcStop();
  _NFC_STATUS = "OFF";
  updateScreen();
  //_consoleLog("NFC OFF");
}

function initialize() {

  _clearWatch();

  changeTag(currentTag, true);

  _setWatch(toggleScreen, _BTN3, {
    repeat: true,
    edge: _Falling,
    debounce: 50
  });

  _setWatch(powerOff, _BTN1, {
    repeat: false,
    edge: _Rising,
    debounce: POWER_OFF_TIME
  });

  _setWatch(cycleTagsUp, _BTN1, {
    repeat: true,
    edge: _Falling,
    debounce: 50
  });

  _setWatch(cycleTagsDown, _BTN4, {
    repeat: true,
    edge: _Falling,
    debounce: 50
  });

  NRF.setAdvertising({}, {
    name: getBufferClone(storage.readArrayBuffer(PUCK_NAME_FILE))
  });
  if (!enableUart) {
    var services = {};
    var response = {};
    response[BLE_SERVICE_ID] = {};
    response[BLE_SERVICE_ID][BLE_COMMAND_CHARACTERISTIC] = {
      value: [],
      indicate: false
    };
    response[BLE_SERVICE_ID][BLE_RETURN_CHARACTERISTIC] = {
      value: [],
      indicate: false
    };

    services[BLE_SERVICE_ID] = {};

    services[BLE_SERVICE_ID][BLE_RETURN_CHARACTERISTIC] = {
      maxLen: 260,
      value: [],
      readable: true,
      writable: false,
      indicate: false
    };

    services[BLE_SERVICE_ID][BLE_COMMAND_CHARACTERISTIC] = {
      maxLen: 20,
      value: [],
      readable: true,
      writable: true,
      indicate: false,
      onWrite: (evt) => {
        var slot,
          startIdx,
          dataSize,
          sourceData,
          oldSlot,
          newSlot;

        if (evt.data.length > 0) {
          response[BLE_SERVICE_ID][BLE_COMMAND_CHARACTERISTIC].value = evt.data;
          switch (evt.data[0]) {
            case 0x01: //Slot Information <Slot>
              if (evt.data.length > 1) {
                //Returns a subset of data for identifying
                slot = evt.data[1] < tags.length ? evt.data[1] : currentTag;
                var data = getTagInfo(slot);
                response[BLE_SERVICE_ID][BLE_RETURN_CHARACTERISTIC].value = Uint8Array(data.length + 2);

                response[BLE_SERVICE_ID][BLE_RETURN_CHARACTERISTIC].value.set(Uint8Array(evt.data, 0, 2), 0);
                response[BLE_SERVICE_ID][BLE_RETURN_CHARACTERISTIC].value[1] = slot;
                response[BLE_SERVICE_ID][BLE_RETURN_CHARACTERISTIC].value.set(data, 2);
              } else {
                //Returns 0x01 <Current Slot> <Slot Count>
                response[BLE_SERVICE_ID][BLE_RETURN_CHARACTERISTIC].value = [0x01, currentTag, tags.length];
              }
              NRF.updateServices(response);
              break;

            case 0x02: //Read <Slot> <StartPage> <PageCount>
              //Max pages: 63
              //Returns 0x02 <Slot> <StartPage> <PageCount> <Data>
              startIdx = evt.data[2] * 4;
              dataSize = evt.data[3] * 4;
              slot = evt.data[1] < tags.length ? evt.data[1] : currentTag;
              sourceData = tags[slot].slice(startIdx, startIdx + dataSize);
              ////_consoleLog("Reading from slot: " + slot);
              ////_consoleLog("Read from " + startIdx + " - " + (startIdx + dataSize));
              response[BLE_SERVICE_ID][BLE_RETURN_CHARACTERISTIC].value = Uint8Array(dataSize + 4);
              response[BLE_SERVICE_ID][BLE_RETURN_CHARACTERISTIC].value.set(Uint8Array(evt.data, 0, 4), 0);
              response[BLE_SERVICE_ID][BLE_RETURN_CHARACTERISTIC].value[1] = slot;
              response[BLE_SERVICE_ID][BLE_RETURN_CHARACTERISTIC].value.set(sourceData, 4);
              NRF.updateServices(response);
              break;

            case 0x03: //Write <Slot> <StartPage> <Data>
              startIdx = evt.data[2] * 4;
              dataSize = evt.data.length - 3;
              slot = evt.data[1] < tags.length ? evt.data[1] : currentTag;

              //store data if it fits into memory
              if ((startIdx + dataSize) <= 572) {
                ////_consoleLog("Write to slot: " + slot);
                ////_consoleLog("Write to start: " + startIdx);
                ////_consoleLog("Write size: " + dataSize);

                tags[slot].set(new Uint8Array(evt.data, 3, dataSize), startIdx);
              }
              break;

            case 0x04: //Save <Slot>
              if (SAVE_TO_FLASH) {
                slot = evt.data[1] < tags.length ? evt.data[1] : currentTag;

                saveTag(slot);
              }
              break;

            case 0xFD: //Move slot <From> <To>
              oldSlot = evt.data[1];
              newSlot = evt.data[2];
              if (oldSlot < tags.length && newSlot < tags.length) {
                tags.splice(newSlot, 0, tags.splice(oldSlot, 1)[0]);
                changeTag(currentTag);
              }
              break;

            case 0xFE: //Enable BLE UART
              NRF.setServices({}, {
                uart: true
              });
              break;

            case 0xFF: //Restart NFC <Slot?>
              if (evt.data.length > 1) {
                changeTag(evt.data[1] >= tags.length ? 0 : evt.data[1]);
              } else {
                changeTag(currentTag);
              }
              break;
          }
        }
      }
    };

    services[BLE_SERVICE_ID][BLE_NAME_CHARACTERISTIC] = {
      maxLen: 20,
      value: new Uint8Array(storage.readArrayBuffer(PUCK_NAME_FILE)),
      readable: true,
      writable: true,
      indicate: false,
      onWrite: (evt) => {
        if (evt.data.length > 0) {
          storage.write(PUCK_NAME_FILE, evt.data);
        } else {
          storage.erase(PUCK_NAME_FILE);
        }
        NRF.setAdvertising({}, {
          name: getBufferClone(storage.readArrayBuffer(PUCK_NAME_FILE))
        });
      }
    };

    services[BLE_SERVICE_ID][BLE_FIRMWARE_CHARACTERISTIC] = {
      value: FIRMWARE_NAME,
      readable: true
    };

    NRF.setServices(services, {
      uart: false,
      advertise: [BLE_SERVICE_ID]
    });
  }
  _NFC_STATUS = "ON";
  //_consoleLog("NFC ON");
}

if (typeof _NTAG215 !== "undefined") {
  if (storage.readArrayBuffer(PUCK_NAME_FILE) == undefined) {
    storage.write(PUCK_NAME_FILE, "NTAG215 " + NRF.getAddress().substr(12, 5).split(":").join(""));
  }

  _NTAG215.setTagBuffer(txBuffer.buffer);
  E.on("kill", _NTAG215.nfcStop);

  NRF.on('NFCon', function nfcOn() {

  });

  NRF.on('NFCoff', function nfcOff() {

    if (fixUid()) {
      _NTAG215.nfcRestart();
    }

    if (_NTAG215.getTagWritten()) {
      if (SAVE_TO_FLASH) {
        //_consoleLog("Saving tag to flash");
        saveTag();
      }
      _NTAG215.setTagWritten(false);
    }
  });

  for (var i = 0; i < tags.length; i++) {
    var filename = "tag" + i + ".bin";
    var buffer = storage.readArrayBuffer(filename);

    if (buffer) {
      //_consoleLog("Loaded " + filename);
      tags[i].set(buffer);
    } else {
      tags[i][0] = 0x04;
      tags[i][1] = _MathRound(_MathRandom() * 255);
      tags[i][2] = _MathRound(_MathRandom() * 255);
      tags[i][3] = tags[i][0] ^ tags[i][1] ^ tags[i][2] ^ 0x88;
      tags[i][4] = _MathRound(_MathRandom() * 255);
      tags[i][5] = _MathRound(_MathRandom() * 255);
      tags[i][6] = _MathRound(_MathRandom() * 255);
      tags[i][7] = _MathRound(_MathRandom() * 255);
      tags[i][8] = tags[i][4] ^ tags[i][5] ^ tags[i][6] ^ tags[i][7];

      tags[i].set([0x48, 0x00, 0x00, 0xE1, 0x10, 0x3E, 0x00, 0x03, 0x00, 0xFE], 0x09);
      tags[i].set([0xBD, 0x04, 0x00, 0x00, 0xFF, 0x00, 0x05], 0x20B);
    }
  }

  setUartWatch();
} else {
  //_consoleLog("We don't have the custom firmware needed.");
  // We don't have the custom firmware needed.

}