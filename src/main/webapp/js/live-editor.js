import { WebRTCAdaptor } from "./webrtc_adaptor.js";
import { generateRandomString, getWebSocketURL, errorHandler } from "./utility.js";

const stageCanvas = document.getElementById("stageCanvas");
const ctx = stageCanvas.getContext("2d");
const stageContainer = document.getElementById("stageContainer");
const layersList = document.getElementById("layersList");
const previewVideo = document.getElementById("previewVideo");
const publishStatus = document.getElementById("publishStatus");

const streamIdInput = document.getElementById("streamId");
const startPublishButton = document.getElementById("startPublish");
const stopPublishButton = document.getElementById("stopPublish");

const stageSizeSelect = document.getElementById("stageSize");
const fitStageButton = document.getElementById("fitStage");
const clearStageButton = document.getElementById("clearStage");
const openPlayerButton = document.getElementById("openPlayer");

const addCameraButton = document.getElementById("addCamera");
const addScreenButton = document.getElementById("addScreen");
const addMediaUrlButton = document.getElementById("addMediaUrl");
const addLocalMediaButton = document.getElementById("addLocalMedia");
const addLiveStreamButton = document.getElementById("addLiveStream");
const addTextButton = document.getElementById("addText");
const addImageButton = document.getElementById("addImage");
const addLocalImageButton = document.getElementById("addLocalImage");
const localMediaInput = document.getElementById("localMediaInput");
const imageInput = document.getElementById("imageInput");
const hiddenMedia = document.getElementById("hiddenMedia");

const selectedLayerInfo = document.getElementById("selectedLayerInfo");
const layerXInput = document.getElementById("layerX");
const layerYInput = document.getElementById("layerY");
const layerWInput = document.getElementById("layerW");
const layerHInput = document.getElementById("layerH");
const layerTextInput = document.getElementById("layerText");
const layerFontSizeInput = document.getElementById("layerFontSize");
const layerColorInput = document.getElementById("layerColor");
const bringForwardButton = document.getElementById("bringForward");
const sendBackwardButton = document.getElementById("sendBackward");
const toggleMuteButton = document.getElementById("toggleMute");
const deleteLayerButton = document.getElementById("deleteLayer");

let layers = [];
let selectedLayerId = null;
let dragging = false;
let resizing = false;
let dragOffset = { x: 0, y: 0 };
let resizeStart = { x: 0, y: 0, w: 0, h: 0 };

let webRTCAdaptor = null;
let publishing = false;
let composedStream = null;
let renderTimer = null;

let audioCtx = null;
let audioDestination = null;
const audioNodes = new Map();

function ensureAudioContext() {
	if (!audioCtx) {
		audioCtx = new (window.AudioContext || window.webkitAudioContext)();
		audioDestination = audioCtx.createMediaStreamDestination();
	}
	return audioCtx;
}

function nextLayerId(prefix) {
	return `${prefix}-${generateRandomString(6)}`;
}

function setStageSize(width, height) {
	stageCanvas.width = width;
	stageCanvas.height = height;
	stageContainer.style.width = `${width}px`;
	stageContainer.style.height = `${height}px`;
	fitStageToViewport();
}

function fitStageToViewport() {
	const container = stageContainer.parentElement;
	const maxWidth = (container?.clientWidth || window.innerWidth) - 20;
	const maxHeight = window.innerHeight - 140;
	const widthRatio = maxWidth / stageCanvas.width;
	const heightRatio = maxHeight / stageCanvas.height;
	const scale = Math.min(1, widthRatio, heightRatio);
	const scaledWidth = stageCanvas.width * scale;
	const scaledHeight = stageCanvas.height * scale;
	stageCanvas.style.width = `${scaledWidth}px`;
	stageCanvas.style.height = `${scaledHeight}px`;
	stageContainer.style.width = `${scaledWidth}px`;
	stageContainer.style.height = `${scaledHeight}px`;
}

function getLayerById(layerId) {
	return layers.find((layer) => layer.id === layerId) || null;
}

function setSelectedLayer(layerId) {
	selectedLayerId = layerId;
	updateLayerInputs();
	renderLayersList();
}

function addLayer(layer) {
	layers.push(layer);
	setSelectedLayer(layer.id);
	renderLayersList();
}

function removeLayer(layerId) {
	const index = layers.findIndex((layer) => layer.id === layerId);
	if (index === -1) return;
	const [layer] = layers.splice(index, 1);
	cleanupLayer(layer);
	if (selectedLayerId === layerId) {
		setSelectedLayer(null);
	}
	renderLayersList();
}

function cleanupLayer(layer) {
	if (layer.stream) {
		layer.stream.getTracks().forEach((track) => track.stop());
	}
	if (layer.playAdaptor) {
		try {
			layer.playAdaptor.stop(layer.playStreamId);
			layer.playAdaptor.closeWebSocket();
		} catch (error) {
			// ignore cleanup errors
		}
	}
	if (layer.element && layer.element.tagName === "VIDEO") {
		layer.element.pause();
		layer.element.srcObject = null;
		layer.element.src = "";
	}
	const audioNode = audioNodes.get(layer.id);
	if (audioNode) {
		audioNode.source.disconnect();
		audioNode.gain.disconnect();
		audioNodes.delete(layer.id);
	}
}

function bringForward() {
	if (!selectedLayerId) return;
	const index = layers.findIndex((layer) => layer.id === selectedLayerId);
	if (index < 0 || index === layers.length - 1) return;
	[layers[index], layers[index + 1]] = [layers[index + 1], layers[index]];
	renderLayersList();
}

function sendBackward() {
	if (!selectedLayerId) return;
	const index = layers.findIndex((layer) => layer.id === selectedLayerId);
	if (index <= 0) return;
	[layers[index], layers[index - 1]] = [layers[index - 1], layers[index]];
	renderLayersList();
}

function toggleMute() {
	const layer = getLayerById(selectedLayerId);
	if (!layer) return;
	if (!audioNodes.has(layer.id)) return;
	layer.muted = !layer.muted;
	const node = audioNodes.get(layer.id);
	node.gain.gain.value = layer.muted ? 0 : 1;
	renderLayersList();
}

function updateLayerInputs() {
	const layer = getLayerById(selectedLayerId);
	if (!layer) {
		selectedLayerInfo.textContent = "None";
		layerXInput.value = "";
		layerYInput.value = "";
		layerWInput.value = "";
		layerHInput.value = "";
		layerTextInput.value = "";
		layerFontSizeInput.value = "";
		layerColorInput.value = "#ffffff";
		return;
	}
	selectedLayerInfo.textContent = `${layer.name} (${layer.type})`;
	layerXInput.value = Math.round(layer.x);
	layerYInput.value = Math.round(layer.y);
	layerWInput.value = Math.round(layer.width);
	layerHInput.value = Math.round(layer.height);
	layerTextInput.value = layer.text || "";
	layerFontSizeInput.value = layer.fontSize || "";
	layerColorInput.value = layer.color || "#ffffff";
}

function updateLayerFromInputs() {
	const layer = getLayerById(selectedLayerId);
	if (!layer) return;
	layer.x = Number(layerXInput.value) || 0;
	layer.y = Number(layerYInput.value) || 0;
	layer.width = Math.max(10, Number(layerWInput.value) || 10);
	layer.height = Math.max(10, Number(layerHInput.value) || 10);
	if (layer.type === "text") {
		layer.text = layerTextInput.value || "Text";
		layer.fontSize = Number(layerFontSizeInput.value) || 36;
		layer.color = layerColorInput.value || "#ffffff";
	}
}

function renderLayersList() {
	layersList.innerHTML = "";
	[...layers].reverse().forEach((layer) => {
		const item = document.createElement("div");
		item.className = `layer-item ${layer.id === selectedLayerId ? "active" : ""}`;
		item.innerHTML = `
			<span class="${layer.muted ? "muted" : ""}">${layer.name}</span>
			<span class="layer-controls">
				<button data-action="select">Select</button>
				<button data-action="delete">Del</button>
			</span>
		`;
		item.querySelector('[data-action="select"]').addEventListener("click", () => {
			setSelectedLayer(layer.id);
		});
		item.querySelector('[data-action="delete"]').addEventListener("click", () => {
			removeLayer(layer.id);
		});
		layersList.appendChild(item);
	});
}

function hitTest(x, y) {
	for (let i = layers.length - 1; i >= 0; i -= 1) {
		const layer = layers[i];
		if (x >= layer.x && x <= layer.x + layer.width && y >= layer.y && y <= layer.y + layer.height) {
			return layer;
		}
	}
	return null;
}

function isInResizeHandle(layer, x, y) {
	const handleSize = 14;
	return (
		x >= layer.x + layer.width - handleSize &&
		x <= layer.x + layer.width + 2 &&
		y >= layer.y + layer.height - handleSize &&
		y <= layer.y + layer.height + 2
	);
}

function drawSelection(layer) {
	ctx.save();
	ctx.strokeStyle = "#2d68ff";
	ctx.lineWidth = 2;
	ctx.strokeRect(layer.x, layer.y, layer.width, layer.height);
	ctx.fillStyle = "#2d68ff";
	ctx.fillRect(layer.x + layer.width - 10, layer.y + layer.height - 10, 10, 10);
	ctx.restore();
}

function renderLayer(layer) {
	if (layer.type === "text") {
		ctx.fillStyle = layer.color || "#ffffff";
		ctx.font = `${layer.fontSize || 36}px Arial`;
		ctx.textBaseline = "top";
		wrapText(layer.text || "Text", layer.x, layer.y, layer.width, layer.fontSize || 36);
		return;
	}

	if (layer.element) {
		if (layer.type === "live" && layer.element.tagName === "VIDEO" && !layer.hasVideoFrames) {
			return;
		}
		if (
			layer.element.tagName === "VIDEO" &&
			(layer.element.readyState < 2 || layer.element.videoWidth === 0 || layer.element.videoHeight === 0)
		) {
			return;
		}
		try {
			ctx.drawImage(layer.element, layer.x, layer.y, layer.width, layer.height);
		} catch (error) {
			// ignore draw errors from cross-origin media
		}
		return;
	}

	ctx.fillStyle = "#222";
	ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
}

function wrapText(text, x, y, maxWidth, fontSize) {
	const words = text.split(" ");
	let line = "";
	const lineHeight = (fontSize || 36) * 1.2;
	for (let i = 0; i < words.length; i += 1) {
		const testLine = `${line}${words[i]} `;
		const metrics = ctx.measureText(testLine);
		if (metrics.width > maxWidth && i > 0) {
			ctx.fillText(line, x, y);
			line = `${words[i]} `;
			y += lineHeight;
		} else {
			line = testLine;
		}
	}
	ctx.fillText(line, x, y);
}

function renderFrame() {
	ctx.fillStyle = "#000000";
	ctx.fillRect(0, 0, stageCanvas.width, stageCanvas.height);

	layers.forEach((layer) => renderLayer(layer));

	const selected = getLayerById(selectedLayerId);
	if (selected) {
		drawSelection(selected);
	}
}
function startRenderLoop() {
	if (renderTimer) {
		clearInterval(renderTimer);
	}
	const interval = document.visibilityState === "hidden" ? 200 : 1000 / 30;
	renderTimer = setInterval(renderFrame, interval);
}

function addAudioNode(layerId, sourceNode) {
	ensureAudioContext();
	const gainNode = audioCtx.createGain();
	gainNode.gain.value = 1;
	sourceNode.connect(gainNode).connect(audioDestination);
	audioNodes.set(layerId, { source: sourceNode, gain: gainNode });
}

function attachLiveStreamAudio(layer) {
	if (audioNodes.has(layer.id)) {
		return;
	}
	if (layer.element?.srcObject) {
		try {
			addAudioNode(layer.id, audioCtx.createMediaStreamSource(layer.element.srcObject));
		} catch (error) {
			// ignore audio attach errors
		}
	}
}

async function addCamera() {
	ensureAudioContext();
	const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
	const video = document.createElement("video");
	video.srcObject = stream;
	video.autoplay = true;
	video.muted = true;
	video.playsInline = true;
	await video.play();

	const layer = {
		id: nextLayerId("camera"),
		name: "Camera",
		type: "camera",
		stream,
		element: video,
		x: 40,
		y: 40,
		width: 360,
		height: 240,
		muted: false,
	};
	addLayer(layer);
	addAudioNode(layer.id, audioCtx.createMediaStreamSource(stream));
}

async function addScreenShare() {
	ensureAudioContext();
	const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
	const video = document.createElement("video");
	video.srcObject = stream;
	video.autoplay = true;
	video.muted = true;
	video.playsInline = true;
	await video.play();

	const layer = {
		id: nextLayerId("screen"),
		name: "Screen",
		type: "screen",
		stream,
		element: video,
		x: 80,
		y: 80,
		width: 480,
		height: 270,
		muted: false,
	};
	addLayer(layer);
	addAudioNode(layer.id, audioCtx.createMediaStreamSource(stream));
	stream.getVideoTracks()[0].addEventListener("ended", () => removeLayer(layer.id));
}

async function addMediaFromUrl(url) {
	if (!url) return;
	ensureAudioContext();
	const video = document.createElement("video");
	video.src = url;
	video.crossOrigin = "anonymous";
	video.loop = true;
	video.autoplay = true;
	video.muted = true;
	video.playsInline = true;
	await video.play();

	const layer = {
		id: nextLayerId("media"),
		name: "Media",
		type: "media",
		element: video,
		x: 120,
		y: 120,
		width: 480,
		height: 270,
		muted: false,
	};
	addLayer(layer);
	try {
		addAudioNode(layer.id, audioCtx.createMediaElementSource(video));
	} catch (error) {
		// ignore CORS errors
	}
}

async function addMediaFromFile(file) {
	if (!file) return;
	const url = URL.createObjectURL(file);
	await addMediaFromUrl(url);
}

async function addImageFromFile(file) {
	if (!file) return;
	const url = URL.createObjectURL(file);
	await addImageFromUrl(url);
}

async function addImageFromUrl(url) {
	if (!url) return;
	const img = new Image();
	img.crossOrigin = "anonymous";
	img.src = url;
	await img.decode();
	const layer = {
		id: nextLayerId("image"),
		name: "Image",
		type: "image",
		element: img,
		x: 160,
		y: 160,
		width: Math.min(400, img.width || 400),
		height: Math.min(300, img.height || 300),
		muted: true,
	};
	addLayer(layer);
}

function addTextLayer() {
	const layer = {
		id: nextLayerId("text"),
		name: "Text",
		type: "text",
		x: 200,
		y: 200,
		width: 400,
		height: 120,
		text: "Your text",
		fontSize: 48,
		color: "#ffffff",
		muted: true,
	};
	addLayer(layer);
}

function addLiveStreamLayer(streamId) {
	if (!streamId) return;
	ensureAudioContext();
	const video = document.createElement("video");
	video.autoplay = true;
	video.muted = true;
	video.playsInline = true;
	video.setAttribute("playsinline", "");
	if (hiddenMedia) {
		hiddenMedia.appendChild(video);
	}

	const layer = {
		id: nextLayerId("live"),
		name: `Live: ${streamId}`,
		type: "live",
		element: video,
		playStreamId: streamId,
		hasVideoFrames: false,
		x: 220,
		y: 220,
		width: 480,
		height: 270,
		muted: false,
	};
	addLayer(layer);

	const wsUrl = getWebSocketURL(window.location);
	const adaptor = new WebRTCAdaptor({
		websocket_url: wsUrl,
		isPlayMode: true,
		debug: false,
		remoteVideoElement: null,
		callback: (info, obj) => {
			if (info === "initialized") {
				adaptor.play(streamId);
			} else if (info === "newStreamAvailable" || info === "newTrackAvailable") {
				const stream = obj?.stream || (obj?.track ? new MediaStream([obj.track]) : null);
				if (stream) {
					video.srcObject = stream;
					layer.stream = stream;
				}
				video.play().catch(() => {});
				attachLiveStreamAudio(layer);
			} else if (info === "play_started") {
				video.play().catch(() => {});
			}
		},
		callbackError: (error, message) => {
			console.error("Live stream error", error, message);
		},
	});

	layer.playAdaptor = adaptor;
	video.addEventListener("loadedmetadata", () => {
		video.play().catch(() => {});
		attachLiveStreamAudio(layer);
	});

	if (typeof video.requestVideoFrameCallback === "function") {
		const markFrames = () => {
			layer.hasVideoFrames = true;
			video.requestVideoFrameCallback(markFrames);
		};
		video.requestVideoFrameCallback(markFrames);
	} else {
		video.addEventListener("timeupdate", () => {
			if (video.currentTime > 0) {
				layer.hasVideoFrames = true;
			}
		});
	}
}

function clearAllLayers() {
	layers.forEach((layer) => cleanupLayer(layer));
	layers = [];
	setSelectedLayer(null);
	renderLayersList();
}

function buildComposedStream() {
	const stream = stageCanvas.captureStream(30);
	if (audioDestination) {
		const audioTrack = audioDestination.stream.getAudioTracks()[0];
		if (audioTrack) {
			stream.addTrack(audioTrack);
		}
	}
	return stream;
}

function initWebRTCAdaptor() {
	if (webRTCAdaptor) return;
	const websocketURL = getWebSocketURL(location);
	webRTCAdaptor = new WebRTCAdaptor({
		websocket_url: websocketURL,
		isPlayMode: true,
		debug: true,
		callback: (info, obj) => {
			if (info === "initialized") {
				startPublishButton.disabled = false;
				publishStatus.textContent = "Ready to publish";
			} else if (info === "publish_started") {
				publishing = true;
				startPublishButton.disabled = true;
				stopPublishButton.disabled = false;
				publishStatus.textContent = "Publishing...";
				webRTCAdaptor.enableStats(obj.streamId);
			} else if (info === "publish_finished") {
				publishing = false;
				startPublishButton.disabled = false;
				stopPublishButton.disabled = true;
				publishStatus.textContent = "Stopped";
			} else if (info === "updated_stats") {
				publishStatus.textContent = `Publishing • ${Math.round(obj.currentOutgoingBitrate || 0)} kbps`;
			}
		},
		callbackError: (error, message) => {
			publishStatus.textContent = errorHandler(error, message);
		},
	});
}

function startPublishing() {
	ensureAudioContext();
	initWebRTCAdaptor();
	const streamId = streamIdInput.value || `live-editor-${generateRandomString(6)}`;
	streamIdInput.value = streamId;
	composedStream = buildComposedStream();
	previewVideo.srcObject = composedStream;
	webRTCAdaptor.mediaManager.gotStream(composedStream);
	webRTCAdaptor.publish(streamId);
}

function stopPublishing() {
	if (!webRTCAdaptor || !publishing) return;
	webRTCAdaptor.stop(streamIdInput.value);
}

function handleCanvasPointerDown(event) {
	const rect = stageCanvas.getBoundingClientRect();
	const scaleX = stageCanvas.width / rect.width;
	const scaleY = stageCanvas.height / rect.height;
	const x = (event.clientX - rect.left) * scaleX;
	const y = (event.clientY - rect.top) * scaleY;
	const layer = hitTest(x, y);
	if (!layer) {
		setSelectedLayer(null);
		return;
	}
	setSelectedLayer(layer.id);
	if (isInResizeHandle(layer, x, y)) {
		resizing = true;
		resizeStart = { x, y, w: layer.width, h: layer.height };
	} else {
		dragging = true;
		dragOffset = { x: x - layer.x, y: y - layer.y };
	}
}

function handleCanvasPointerMove(event) {
	const layer = getLayerById(selectedLayerId);
	if (!layer || (!dragging && !resizing)) return;
	const rect = stageCanvas.getBoundingClientRect();
	const scaleX = stageCanvas.width / rect.width;
	const scaleY = stageCanvas.height / rect.height;
	const x = (event.clientX - rect.left) * scaleX;
	const y = (event.clientY - rect.top) * scaleY;

	if (dragging) {
		layer.x = x - dragOffset.x;
		layer.y = y - dragOffset.y;
		updateLayerInputs();
		return;
	}

	if (resizing) {
		const deltaX = x - resizeStart.x;
		const deltaY = y - resizeStart.y;
		let newW = Math.max(20, resizeStart.w + deltaX);
		let newH = Math.max(20, resizeStart.h + deltaY);
		if (event.shiftKey) {
			const ratio = resizeStart.w / resizeStart.h;
			newH = newW / ratio;
		}
		layer.width = newW;
		layer.height = newH;
		updateLayerInputs();
	}
}

function handleCanvasPointerUp() {
	dragging = false;
	resizing = false;
}

function bindInputEvents() {
	layerXInput.addEventListener("input", updateLayerFromInputs);
	layerYInput.addEventListener("input", updateLayerFromInputs);
	layerWInput.addEventListener("input", updateLayerFromInputs);
	layerHInput.addEventListener("input", updateLayerFromInputs);
	layerTextInput.addEventListener("input", updateLayerFromInputs);
	layerFontSizeInput.addEventListener("input", updateLayerFromInputs);
	layerColorInput.addEventListener("input", updateLayerFromInputs);
}

function initDefaults() {
	streamIdInput.value = `live-editor-${generateRandomString(6)}`;
	startPublishButton.disabled = true;
	publishStatus.textContent = "Initializing...";
	const [width, height] = stageSizeSelect.value.split("x").map(Number);
	setStageSize(width, height);
}

addCameraButton.addEventListener("click", () => addCamera().catch(console.error));
addScreenButton.addEventListener("click", () => addScreenShare().catch(console.error));
addMediaUrlButton.addEventListener("click", () => {
	const url = window.prompt("Enter media URL");
	addMediaFromUrl(url).catch(console.error);
});
addLocalMediaButton.addEventListener("click", () => localMediaInput.click());
addLiveStreamButton.addEventListener("click", () => {
	const streamId = window.prompt("Enter stream ID to play");
	addLiveStreamLayer(streamId);
});
addTextButton.addEventListener("click", addTextLayer);
addImageButton.addEventListener("click", () => {
	const url = window.prompt("Enter image URL");
	if (url) {
		addImageFromUrl(url).catch(console.error);
	}
});
addLocalImageButton.addEventListener("click", () => imageInput.click());

localMediaInput.addEventListener("change", (event) => {
	addMediaFromFile(event.target.files[0]).catch(console.error);
	localMediaInput.value = "";
});

imageInput.addEventListener("change", (event) => {
	addImageFromFile(event.target.files[0]).catch(console.error);
	imageInput.value = "";
});

bringForwardButton.addEventListener("click", bringForward);
sendBackwardButton.addEventListener("click", sendBackward);
toggleMuteButton.addEventListener("click", toggleMute);
deleteLayerButton.addEventListener("click", () => removeLayer(selectedLayerId));

fitStageButton.addEventListener("click", fitStageToViewport);
clearStageButton.addEventListener("click", clearAllLayers);
openPlayerButton.addEventListener("click", () => {
	const streamId = streamIdInput.value?.trim();
	if (!streamId) {
		return;
	}
	const playerUrl = new URL("play.html", window.location.href);
	playerUrl.searchParams.set("id", streamId);
	window.open(playerUrl.toString(), "_blank");
});
stageSizeSelect.addEventListener("change", (event) => {
	const [width, height] = event.target.value.split("x").map(Number);
	setStageSize(width, height);
});

startPublishButton.addEventListener("click", startPublishing);
stopPublishButton.addEventListener("click", stopPublishing);

stageCanvas.addEventListener("mousedown", handleCanvasPointerDown);
stageCanvas.addEventListener("mousemove", handleCanvasPointerMove);
stageCanvas.addEventListener("mouseup", handleCanvasPointerUp);
stageCanvas.addEventListener("mouseleave", handleCanvasPointerUp);

window.addEventListener("resize", fitStageToViewport);
document.addEventListener("visibilitychange", startRenderLoop);

initDefaults();
bindInputEvents();
initWebRTCAdaptor();
renderFrame();
startRenderLoop();
