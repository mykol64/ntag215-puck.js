require("./style/main.scss")

import { getBlankNtag } from "./ntag215"
import { Puck } from "./puck"
import { showModal, hideModal, setModal, ModalShowOptions, ModalButtonTypes, ModalResult } from "./modal"
import { saveData, readFile } from "./fileHelpers"
import { supportsBluetooth, bluetoothOrError } from "./browserCheck"
import { EspruinoBoards, SecureDfuUpdate, SecureDfuUpdateMessage, SecureDfuUpdateProgress } from "./SecureDfuUpdate"
import * as EspruinoHelper from "./espruino"
import { ModalMessageType, modalMessages } from "./modalMessages"
import { selectText, selectThis } from "./selectText"
import amiibo from "../amiibo.json"
import  * as bootstrap from "bootstrap";
import { isPlainObject } from "jquery"

const toArrayBuffer = require("arraybuffer-loader/lib/to-array-buffer.js")
const slotTemplate = require("./templates/slot.pug")
const boardTemplate = require("./templates/board-selector.pug")
const modalTemplate = require("./templates/modal-content.pug")

const anyWindow = (window as any)
const puck = anyWindow.puck = new Puck(console.log, console.warn, console.error)

interface Amiibo {
  name: string
}

$(() => {
  const mainContainer = $("#mainContainer")
  const slotsContainer = $("#slotsContainer")
  const scriptTextArea = $("#code")
  const firmwareName = $("#code").text().match(/const FIRMWARE_NAME = \"([^"]+)\";/)[1]

  const flexModal = document.getElementById('flexModal')
  const modalTitle = document.getElementById('flexModal').querySelector('.modal-title')
  const modalText = document.getElementById('flexModal').querySelector('.modal-body .modal-text')
  const modalControl = new bootstrap.Modal(flexModal)
  let modalContent = modalTemplate()

  if (supportsBluetooth !== true) {
    modalContent = modalTemplate({
      title: "Unsupported browser :(",
      text: supportsBluetooth
    })
    flexModal.innerHTML = modalContent
    modalControl.show(flexModal)
  }

  if (__DEVELOPMENT__) {
    anyWindow.debug = {
      ...(anyWindow.debug || {}),
      ...{
        EspruinoHelper,
        hardwareChooser,
        // hideModal,
        modalMessages,
        puck,
        readFile,
        saveData,
        // setModal,
        // showModal,
      }
    }
  }

  async function populateSlots() {
    slotsContainer.empty()

    if (puck.isConnected) {
      const info = await puck.getSlotInformation()
      modalContent = modalTemplate({
        title: "Just a sec...",
        text: "Reading Slot 1"
      })
      flexModal.innerHTML = modalContent
      // console.log(flexModal.outerHTML)
      modalControl.show(flexModal)

      for (let i = 0; i < info.totalSlots; i++) {
        flexModal.querySelector('.modal-text').textContent = `Reading Slot ${i + 1}`
        const slotInfo = await puck.readSlotSummary(i)
        slotsContainer.append(getSlotElement(i, slotInfo))
      }
      modalControl.hide(flexModal)
    }
  }

  function array2hex(data: Uint8Array): string {
    return Array.prototype.map.call(data, (e: number) => ("00" + e.toString(16)).slice(-2)).join("")
  }

  async function updateSlotElement(slot: number, oldElement: JQuery<HTMLElement>) {
    const info = await puck.readSlotSummary(slot)
    getSlotElement(slot, info).insertAfter(oldElement)
    oldElement.remove()
  }

  async function writeSlot(slot: number, data: Uint8Array, element: JQuery<HTMLElement>) {
    await showModal({
      title: "Please Wait",
      message: `Writing slot ${slot + 1}`,
      preventClose: true
    })
    await puck.writeSlot(slot, data)
    await updateSlotElement(slot, element)
    await hideModal()
  }

  function getSlotElement(slot: number, summary: Uint8Array): JQuery<HTMLElement> {
    const id = array2hex(summary.slice(40, 44)) + array2hex(summary.slice(44, 48));
    var name = "Unknown";
    var gameseries = "Unknown";
    var amiiboseries = "Unknown";
    var type = "Unknown";
    var image = "";
    if (id != "000000000000000") {
      Object.entries(amiibo.amiibo).forEach(([key, value]) => {
        if (value.head + value.tail == id) {
          name = value.name;
          gameseries = value.gameSeries;
          amiiboseries = value.amiiboSeries;
          type = value.type;
          image = value.image;
          return;
        }
      })
    }
    const element = $(slotTemplate({
      slot,
      //uid: array2hex(summary.slice(0, 8)),
      id: id,
      name: name,
      gameseries: gameseries,
      amiiboseries: amiiboseries,
      type: type,
      image: image
    }))

    element.find(".slot-download-link").on("click", async (e) => {
      e.preventDefault()

      try {
        await showModal({
          title: "Please Wait",
          message: `Reading slot ${slot + 1}`,
          preventClose: true
        })
        const data = await puck.readSlot(slot)
        await hideModal()
        saveData(data, `${name}.bin`)
      } catch (error) {
        await showModal({
          title: "Error",
          message: error.toString()
        })
      }
    })

    element.find(".slot-upload-link").on("click", async (e) => {
      e.preventDefault()

      try {
        const file = await readFile(572)
        await writeSlot(slot, file.data, element)
      } catch (error) {
        await showModal({
          title: "Error",
          message: error.toString()
        })
      }
    })

    element.find(".slot-clear-link").on("click", async (e) => {
      e.preventDefault()

      await writeSlot(slot, getBlankNtag(), element)
    })

    element.find(".slot-select-link").on("click", async (e) => {
      e.preventDefault()

      try {
        await showModal({
          title: "Please Wait",
          message: `Changing to slot ${slot + 1}`,
          preventClose: true
        })

        element.toggleClass('selection-pending')

        await puck.changeSlot(slot)
        await hideModal()
        
        element.toggleClass('selection-pending').addClass('active')
        element.siblings('.active').removeClass('active')

      } catch (error) {
        await showModal({
          title: "Error",
          message: error.toString()
        })
      }
    })

    element.find(".select-previous").on("click", async (e) => {
      if (element.next().length) {
        element.next('.slot').find('.slot-select-link').trigger('click')
      } else {
        element.parent().first().find('.slot-select-link').trigger('click')
      }
    })

    element.find(".select-next").on("click", async (e) => {
      if (element.prev().length) {
        element.prev('.slot').find('.slot-select-link').trigger('click')
      } else {
        element.parent().last().find('.slot-select-link').trigger('click')
      }
    })

    return element
  }

  async function connectPuck(e: Event | JQuery.Event) {
    e.preventDefault()

    try {
      await bluetoothOrError()
      await showModal({
        title: "Please Wait",
        message: "Connecting to puck",
        preventClose: true
      })
      await puck.connect(async (ev) => {
        await disconnectPuck(ev)
      })

      if (puck.isConnected) {
        await populateSlots()

        mainContainer.addClass("connected")
      }

      if (firmwareName !== puck.firmwareName) {
        const installUpdatedScript = ModalResult.ButtonYes === await showModal({
          title: "Script Update Available",
          message: "There is a script update available, do you want to update?",
          dialog: true,
          buttons: ModalButtonTypes.YesNo
        })

        if (installUpdatedScript) {
          await enableUart(e)
          await uploadScript(e)
        }
      } else {
        await hideModal()
      }

    } catch (error) {
      await showModal({
        title: "Error",
        message: error.toString()
      })
    }
  }

  async function disconnectPuck(e: Event | JQuery.Event) {
    e.preventDefault()
    try {
      if (puck.isConnected) {
        await showModal({
          title: "Please Wait",
          message: "Disconnecting from puck",
          preventClose: true
        })
        await puck.disconnect()
      }

      mainContainer.removeClass("connected")

      await hideModal()
    } catch (error) {
      await showModal({
        title: "Error",
        message: error.toString()
      })
    }
  }

  async function enableUart(e: Event | JQuery.Event) {
    e.preventDefault()
    try {
      await showModal({
        title: "Please Wait",
        message: "Enabling UART",
        preventClose: true
      })
      await puck.enableUart()
      await disconnectPuck(e)
      await hideModal()
    } catch (error) {
      await showModal({
        title: "Error",
        message: error.toString()
      })
    }
  }

  async function changeName(e: Event | JQuery.Event) {
    e.preventDefault()
    try {
      await showModal({
        title: "Please Wait",
        message: "Reading puck name",
        preventClose: true
      })
      const currentName = await puck.getName()
      const newName = prompt("Enter a name", currentName)

      if (newName != null) {
        await showModal({
          title: "Please Wait",
          message: "Setting puck name",
          preventClose: true
        })
        await puck.setName(newName)
      }

      await hideModal()
    } catch (error) {
      await showModal({
        title: "Error",
        message: error.toString()
      })
    }
  }

  async function hardwareChooser(): Promise<EspruinoBoards> {
    const boards = [
      {
        name: "Bangle.js",
        value: EspruinoBoards.BangleJS
      },
      {
        name: "Bangle.js 2",
        value: EspruinoBoards.BangleJS2
      },
      {
        name: "Pixl.js",
        value: EspruinoBoards.PixlJS
      },
      {
        name: "Puck.js",
        value: EspruinoBoards.PuckJSMinimal,
        selected: true
      }
    ]

    const html = $(boardTemplate({ boards }))
    const selector = html.find("select")

    const result = await showModal({
      title: "Select your board",
      message: html,
      dialog: true,
      buttons: ModalButtonTypes.Next
    })

    if (result === ModalResult.ButtonNext) {
      return selector.val() as EspruinoBoards
    }

    throw new Error("User cancelled board selection.")
  }

  async function uploadScript(e: Event | JQuery.Event) {
    try {
      await bluetoothOrError()
      await showModal({
        title: "Please Wait",
        message: "Connecting to puck",
        preventClose: true
      })
      await EspruinoHelper.open()

      const board = await EspruinoHelper.getBoard()
      const ver = await EspruinoHelper.getNtagVersion()

      if (!(ver.major === 1 && ver.minor >= 0)) {
        EspruinoHelper.close()

        if (ModalResult.ButtonYes === await showModal({
          title: "Firmware Update",
          message: "To use this script you must install a custom firmware onto your Puck.js, do you want to do that now?",
          preventClose: true,
          buttons: ModalButtonTypes.YesNo,
          dialog: true
        })) {
          await showModal({
            title: "Loading Firmware",
            message: "Downloading firmware",
            preventClose: true
          })
          await updateFirmware(e, true, board as EspruinoBoards)
        } else {
          return
        }
      }

      const modalResult = await showModal({
        title: "Save to Flash?",
        message: modalMessages(ModalMessageType.SaveToFlash),
        htmlEscapeBody: false,
        buttons: ModalButtonTypes.YesNo,
        dialog: true,
        preventClose: true
      })

      await showModal({
        title: "Please Wait",
        message: "Uploading script file, please wait.",
        preventClose: true
      })

      await EspruinoHelper.writeCode({
        saveToFlash: modalResult === ModalResult.ButtonYes,
        board
      })

      EspruinoHelper.close()
      await hideModal()
    } catch (error) {
      EspruinoHelper.close()

      await showModal({
        title: "Error",
        message: error.toString()
      })
    }
  }

  async function updateFirmware(e: Event | JQuery.Event, throwError?: boolean, board?: EspruinoBoards) {
    let modalShown = false
    let canClose = true

    try {
      await bluetoothOrError()

      await showModal({
        title: "Instructions",
        message: modalMessages(ModalMessageType.DfuInstructions),
        dialog: true,
        preventClose: true,
        buttons: ModalButtonTypes.Next
      })

      let previousMessage: string

      async function status(event: SecureDfuUpdateMessage) {
        previousMessage = event.message
        canClose = event.final

        if (modalShown === false || event.final) {
          modalShown = true
          await showModal({
            title: "Updating Firmware",
            message: previousMessage,
            preventClose: event.final !== true
          })
        } else {
          setModal({
            title: "Updating Firmware",
            message: previousMessage
          })
        }
      }

      async function log(event: SecureDfuUpdateMessage) {
        console.log(event)
      }

      async function progress(event: SecureDfuUpdateProgress) {
        setModal({
          title: "Updating Firmware",
          message: modalMessages(ModalMessageType.FirmwareUpdate, {
            message: previousMessage,
            currentBytes: event.currentBytes,
            totalBytes: event.totalBytes
          })
        })
      }

      const dfu = new SecureDfuUpdate(status, log, progress)

      await dfu.update(board || await hardwareChooser())
    } catch (error) {
      if (throwError) {
        throw error
      }

      if (modalShown === false || canClose !== true) {
        await showModal({
          title: "Error",
          message: error.toString()
        })
      } else {
        setModal({
          title: "Error",
          message: error.toString()
        })
      }
    }
  }

  $("#puckConnect").on("click", connectPuck).prop("disabled", false)
  $("#puckDisconnect").on("click", disconnectPuck).prop("disabled", false)
  $("#puckUart").on("click", enableUart).prop("disabled", false)
  $("#puckName").on("click", changeName).prop("disabled", false)
  $("#uploadScript").on("click", uploadScript).prop("disabled", false)
  $("#updateFirmware").on("click", updateFirmware).prop("disabled", false)
  $("#code, #readme a[href$='ntag215.js']").on("click", (e) => {
    e.preventDefault()

    selectText(scriptTextArea[0])
  })
})
