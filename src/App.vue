<template>
	<div class="radio-container">
		<h1 class="main-title">DracoRadio</h1>

		<div class="card player-card">
			<div class="stream-header">
				<h3>Estado del Stream</h3>
				<span :class="isLive ? 'badge-live' : 'badge-offline'">
					<span class="dot" v-if="isLive"></span> {{ isLive ? 'EN VIVO' : 'OFFLINE' }}
				</span>
			</div>

			<audio ref="audioPlayer" class="hidden-audio"></audio>

			<div class="player-wrapper">
				<div class="player" :class="{ 'play': isPlaying }">

					<div class="player__timeline">
						<p class="player__author">Creador 98.7FM</p>
						<p class="player__song">La unica radio que juega con tus sentidos</p>
						<div class="player__timelineBar">
							<div id="playhead" :class="{ 'live-active': isPlaying }"></div>
						</div>
					</div>

					<div class="player__bar">
						<div class="player__album">
							<div class="player__albumImg active-song" :class="{ 'spin-animation': isPlaying }"
								:style="{ backgroundImage: `url(${ALBUM_IMAGE})` }"></div>
						</div>

						<div class="player__controls">

							<div class="player__play" @click="togglePlay" :class="{ 'disabled': !isLive }">
								<svg v-if="!isPlaying" class="icon play-icon" xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 64 64">
									<path
										d="M51.109 30.335l-36-24A2 2 0 0 0 12 8v48a2.003 2.003 0 0 0 2 2c.388 0 .775-.113 1.109-.336l36-24a2 2 0 0 0 0-3.329z" />
								</svg>
								<svg v-else class="icon pause-icon" xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 100 100">
									<path
										d="M22.537 8.046h17.791c1.104 0 2.003.898 2.003 1.993v79.912a2.005 2.005 0 0 1-2.003 2.003h-17.79a2.005 2.005 0 0 1-2.003-2.003V10.04c0-1.095.898-1.993 2.002-1.993zM59.672 8.046h17.8c1.095 0 1.993.898 1.993 1.993v79.912a2.003 2.003 0 0 1-1.993 2.003h-17.8a1.997 1.997 0 0 1-1.993-2.003V10.04c0-1.095.889-1.993 1.993-1.993z" />
								</svg>
							</div>

							<div class="cc-btn" @click="toggleCC" :class="{ 'cc-active': isCCOn, 'disabled': !isLive }"
								title="Activar Subtitulos">
								CC
							</div>

							<div class="volume-container">
								<svg viewBox="0 0 24 24" class="icon-small volume-icon">
									<path
										d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
								</svg>
								<input type="range" min="0" max="1" step="0.01" v-model="volume" @input="updateVolume"
									class="volume-slider">
							</div>

						</div>
					</div>

				</div>
			</div>

			<div class="stats">
				<p>Oyentes actuales en la pagina: <strong>{{ totalUsers }}</strong></p>
			</div>
		</div>

		<div class="card transcription-card">
			<h3>Transcripcion de la IA</h3>
			<div class="transcription-box">

				<div v-if="isCCOn">
					<span class="text-stream">
						{{ displayedText }}<span v-if="displayedText.length > 0 || isTyping" class="cursor">|</span>
					</span>
					<span class="interim-text">
						{{ interimText }}
					</span>
					<p v-if="displayedText.length === 0 && !isTyping && interimText.length === 0" class="placeholder">
						Escuchando al locutor...
					</p>
				</div>

				<p v-else class="placeholder">
					Activa el boton CC en el reproductor para leer la transcripcion.
				</p>

			</div>
			<button v-if="isCCOn" @click="clearText" class="btn-clear">Limpiar Pantalla</button>
		</div>
	</div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { io } from 'socket.io-client';
import mpegts from 'mpegts.js';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;
const AUDIO_URL = import.meta.env.VITE_AUDIO_URL;
const ALBUM_IMAGE = import.meta.env.VITE_ALBUM_IMAGE;

const isLive = ref(false);
const totalUsers = ref(0);
const displayedText = ref('');
const interimText = ref('');
const audioPlayer = ref(null);

const isPlaying = ref(false);
const volume = ref(0.8);
const isCCOn = ref(false);

let socket = null;
let flvPlayer = null;

let typeQueue = '';
let isTyping = ref(false);
let lastReceivedChunk = '';

onMounted(() => {
	socket = io(SOCKET_URL);

	socket.on('stream-status', (data) => {
		isLive.value = data.isLive;
		if (data.isLive) {
			initAudioPlayer();
		} else {
			destroyAudioPlayer();
			isPlaying.value = false;
		}
	});

	socket.on('transcription-data', (data) => {
		if (!isCCOn.value) return;

		if (data.isFinal) {
			interimText.value = '';

			let newText = data.text.trim();
			if (newText === lastReceivedChunk) return;
			if (displayedText.value.endsWith(newText)) return;

			lastReceivedChunk = newText;
			typeQueue += newText + ' ';

			if (typeQueue.length > 250) {
				displayedText.value += typeQueue;
				typeQueue = '';

				if (displayedText.value.length > 150) {
					displayedText.value = "..." + displayedText.value.slice(-150);
				}
			}

			if (!isTyping.value) {
				processTypeQueue();
			}
		} else {
			let textGris = data.text.trimStart();
			interimText.value = "  " + textGris;
		}
	});

	socket.on('audience-count', (count) => {
		totalUsers.value = count;
	});
});

const processTypeQueue = () => {
	if (typeQueue.length === 0 || !isCCOn.value) {
		isTyping.value = false;
		return;
	}

	isTyping.value = true;
	displayedText.value += typeQueue.charAt(0);
	typeQueue = typeQueue.substring(1);

	if (displayedText.value.length > 130) {
		let primerEspacio = displayedText.value.indexOf(' ');
		if (primerEspacio !== -1) {
			displayedText.value = displayedText.value.substring(primerEspacio + 1);
		} else {
			displayedText.value = displayedText.value.substring(1);
		}
	}

	let velocidad = typeQueue.length > 50 ? 15 : 35;
	setTimeout(processTypeQueue, velocidad);
};

const togglePlay = () => {
	if (!isLive.value || !audioPlayer.value || !flvPlayer) return;

	if (isPlaying.value) {
		audioPlayer.value.pause();
		isPlaying.value = false;
		if (isCCOn.value && socket) socket.emit("toggle-cc", false);
	} else {
		flvPlayer.unload();
		flvPlayer.load();

		audioPlayer.value.play().then(() => {
			isPlaying.value = true;
			if (isCCOn.value && socket) socket.emit("toggle-cc", true);
		}).catch(err => {
			console.error("Error al reproducir audio:", err);
		});
	}
};

const toggleCC = () => {
	if (!isLive.value) return;

	isCCOn.value = !isCCOn.value;

	if (socket) {
		socket.emit("toggle-cc", isCCOn.value && isPlaying.value);
	}

	if (!isCCOn.value) {
		clearText();
	}
};

const updateVolume = () => {
	if (audioPlayer.value) {
		audioPlayer.value.volume = volume.value;
	}
};

const initAudioPlayer = async () => {
	await nextTick();

	if (!audioPlayer.value) return;

	if (mpegts.isSupported()) {
		destroyAudioPlayer();

		flvPlayer = mpegts.createPlayer({
			type: 'flv',
			isLive: true,
			url: AUDIO_URL,
			hasAudio: true,
			hasVideo: false
		}, {
			enableStashBuffer: false,
			stashInitialSize: 128,
			liveBufferLatencyChasing: true,
			liveBufferLatencyMaxLatency: 2,
			liveBufferLatencyMinRemain: 0.5
		});

		flvPlayer.attachMediaElement(audioPlayer.value);
		audioPlayer.value.volume = volume.value;
		flvPlayer.load();
	} else {
		console.error("Navegador no compatible con mpegts");
	}
};

const destroyAudioPlayer = () => {
	if (flvPlayer) {
		flvPlayer.pause();
		flvPlayer.unload();
		flvPlayer.detachMediaElement();
		flvPlayer.destroy();
		flvPlayer = null;
	}
};

const clearText = () => {
	displayedText.value = '';
	interimText.value = '';
	typeQueue = '';
	lastReceivedChunk = '';
};

onBeforeUnmount(() => {
	if (socket) socket.disconnect();
	destroyAudioPlayer();
});
</script>

<style scoped>
.radio-container {
	max-width: 700px;
	margin: 40px auto;
	font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
	color: #f3f4f6;
	padding: 25px;
	background: #111827;
	border-radius: 16px;
	box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
}

.main-title {
	text-align: center;
	font-size: 1.8rem;
	margin-bottom: 30px;
}

.card {
	background-color: #1f2937;
	padding: 25px;
	border-radius: 12px;
	margin-bottom: 25px;
	border: 1px solid #374151;
}

.hidden-audio {
	display: none;
}

.stream-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 25px;
	border-bottom: 1px solid #374151;
	padding-bottom: 15px;
}

.stream-header h3 {
	margin: 0;
	font-size: 1.1rem;
	color: #9ca3af;
}

.badge-live {
	display: flex;
	align-items: center;
	gap: 8px;
	color: #ef4444;
	font-weight: 700;
	padding: 4px 12px;
	background-color: rgba(239, 68, 68, 0.1);
	border-radius: 20px;
}

.badge-offline {
	color: #6b7280;
	font-weight: 700;
	padding: 4px 12px;
	background-color: rgba(107, 114, 128, 0.1);
	border-radius: 20px;
}

.dot {
	width: 8px;
	height: 8px;
	background-color: #ef4444;
	border-radius: 50%;
	animation: pulse-red 1.5s infinite;
}

.player-wrapper {
	height: 180px;
	display: flex;
	align-items: flex-end;
	justify-content: center;
	margin-top: 20px;
}

.player {
	position: relative;
	width: 420px;
}

.player.play .player__timeline {
	transform: translateY(-90%);
}

.player.play .player__album {
	transform: translateY(-55px);
}

.player.play .player__album:after {
	box-shadow: 0px 30px 28px -10px rgba(0, 0, 0, .2);
}

.player__bar {
	background: #ffffff;
	height: 100px;
	padding: 0 20px 0 25px;
	display: flex;
	align-items: center;
	justify-content: flex-start;
	border-radius: 15px;
	box-shadow: 0 15px 35px rgba(0, 0, 0, 0.4);
	position: relative;
	z-index: 3;
	box-sizing: border-box;
}

.player__album {
	width: 112px;
	height: 112px;
	min-width: 112px;
	flex-shrink: 0;
	border-radius: 50%;
	margin-right: 15px;
	transform: translateY(-25px);
	transition: all .4s cubic-bezier(0.25, 0.8, 0.25, 1);
	position: relative;
}

.player__album:before {
	content: '';
	width: 25px;
	height: 25px;
	position: absolute;
	z-index: 3;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	background: #ffffff;
	border-radius: 50%;
	box-shadow: inset 0 0 4px rgba(0, 0, 0, 0.3);
}

.player__albumImg {
	background-size: cover;
	background-position: center;
	width: 100%;
	height: 100%;
	border-radius: 50%;
	position: relative;
	z-index: 2;
	box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

.player__controls {
	display: flex;
	align-items: center;
	flex-grow: 1;
	justify-content: center;
	position: relative;
	height: 100%;
}

.player__play {
	cursor: pointer;
	height: 85px;
	width: 85px;
	display: flex;
	justify-content: center;
	align-items: center;
	border-radius: 20px;
	transition: all 0.2s ease-in-out;
	background: transparent;
}

.player__play:hover:not(.disabled) {
	background: #f0f3f8;
}

.player__play.disabled {
	opacity: 0.3;
	cursor: not-allowed;
}

.icon {
	width: 45px;
	height: 45px;
	fill: #b5b9c2;
	transition: all 0.2s ease-in-out;
}

.player__play:hover:not(.disabled) .icon {
	fill: #858b96;
}

.cc-btn {
	position: absolute;
	left: 0;
	cursor: pointer;
	height: 32px;
	width: 42px;
	display: flex;
	justify-content: center;
	align-items: center;
	border-radius: 8px;
	font-weight: 900;
	font-size: 0.9rem;
	color: #b5b9c2;
	border: 2px solid #b5b9c2;
	transition: 0.2s;
}

.cc-btn:hover:not(.disabled) {
	color: #858b96;
	border-color: #858b96;
	background: #f0f3f8;
}

.cc-btn.cc-active {
	color: #fd6d94;
	border-color: #fd6d94;
	background: rgba(253, 109, 148, 0.1);
}

.cc-btn.disabled {
	opacity: 0.3;
	cursor: not-allowed;
}

.volume-container {
	position: absolute;
	right: 0;
	display: flex;
	align-items: center;
	gap: 10px;
	width: 90px;
	opacity: 0.8;
	transition: opacity 0.3s;
}

.volume-container:hover {
	opacity: 1;
}

.icon-small {
	width: 20px;
	height: 20px;
	fill: #b5b9c2;
	flex-shrink: 0;
}

.volume-slider {
	-webkit-appearance: none;
	width: 100%;
	height: 6px;
	border-radius: 3px;
	background: #E7E7E7;
	outline: none;
	cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
	-webkit-appearance: none;
	width: 14px;
	height: 14px;
	border-radius: 50%;
	background: #fd6d94;
	cursor: pointer;
	transition: transform 0.2s;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.volume-slider::-webkit-slider-thumb:hover {
	transform: scale(1.3);
}

.player__timeline {
	background: #fdfdfd;
	height: 100px;
	border-radius: 15px;
	position: absolute;
	bottom: 0;
	left: 10px;
	right: 10px;
	transform: translateY(0);
	transition: all .4s cubic-bezier(0.25, 0.8, 0.25, 1);
	z-index: 1;
	padding-left: 140px;
	padding-right: 20px;
	display: flex;
	flex-direction: column;
	justify-content: center;
	box-shadow: 0 -5px 10px rgba(0, 0, 0, 0.1);
}

.player__author {
	line-height: 1;
	font-weight: 800;
	margin: 0 0 6px 0;
	color: #333333;
	font-size: 1.1rem;
}

.player__song {
	line-height: 1.2;
	margin: 0;
	font-size: 0.85rem;
	color: #888888;
}

.player__timelineBar {
	background: #E7E7E7;
	width: 100%;
	height: 4px;
	border-radius: 15px;
	margin-top: 15px;
	position: relative;
	overflow: hidden;
}

#playhead {
	position: absolute;
	top: 0;
	left: 0;
	border-radius: 15px;
	width: 30%;
	height: 100%;
	background: #fd6d94;
	opacity: 0;
}

.stats {
	margin-top: 20px;
	text-align: center;
	color: #9ca3af;
	font-size: 0.9rem;
	border-top: 1px solid #374151;
	padding-top: 15px;
}

.transcription-box {
	background-color: rgba(0, 0, 0, 0.3);
	min-height: 120px;
	max-height: 250px;
	overflow-y: auto;
	padding: 20px;
	border-radius: 8px;
	border-left: 3px solid #fd6d94;
	margin-top: 10px;
	line-height: 1.7;
	font-size: 1.15rem;
}

.text-stream {
	color: #f3f4f6;
}

.interim-text {
	color: #9ca3af;
	font-style: italic;
}

.placeholder {
	color: #4b5563;
	font-style: italic;
	text-align: center;
	margin-top: 30px;
}

.btn-clear {
	background-color: transparent;
	color: #9ca3af;
	border: 1px solid #4b5563;
	padding: 6px 15px;
	border-radius: 20px;
	margin-top: 15px;
	cursor: pointer;
	transition: 0.3s;
	font-size: 0.85rem;
}

.btn-clear:hover {
	background-color: #374151;
	color: white;
	border-color: #6b7280;
}

.cursor {
	display: inline-block;
	width: 8px;
	height: 1.2rem;
	background-color: #fd6d94;
	margin-left: 4px;
	vertical-align: middle;
	animation: blink 1s step-end infinite;
}

/* ANIMACIONES */
@keyframes blink {

	0%,
	100% {
		opacity: 1;
	}

	50% {
		opacity: 0;
	}
}

@keyframes pulse-red {
	0% {
		box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
	}

	70% {
		box-shadow: 0 0 0 6px rgba(239, 68, 68, 0);
	}

	100% {
		box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
	}
}

.live-active {
	opacity: 1 !important;
	animation: scan 2s linear infinite;
}

@keyframes scan {
	0% {
		left: -30%;
	}

	100% {
		left: 100%;
	}
}

.spin-animation {
	animation: spin-record 4s linear infinite;
}

@keyframes spin-record {
	100% {
		transform: rotate(360deg);
	}
}
</style>