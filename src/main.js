import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "https://unpkg.com/three@0.160.0/examples/jsm/libs/meshopt_decoder.module.js";
import { RGBELoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/RGBELoader.js";

let scene, camera, renderer;
let model;
let clock = new THREE.Clock();

let move = { forward:false, backward:false, left:false, right:false };
let canMove = false;
let isMobile = false;

let yawObject;
let pitchObject;
let pitch = 0;

const playerHeight = 1.7;
const playerRadius = 0.35;
const speed = 4.5;
const stepHeight = 0.2;
let playerBaseY = 0;

const SPAWN = new THREE.Vector3(0, 1.5, 5);

init();

function detectMobile() {
    const uaMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent);
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const smallScreen = window.innerWidth < 900;

    return uaMobile || (coarsePointer && smallScreen);
}

async function init(){

    isMobile = detectMobile();
    console.log("isMobile:", isMobile);

    const container = document.getElementById("container") || document.body;
    const startScreen = document.getElementById("startScreen");
    const controlsText = document.getElementById("controlsText");

    if (controlsText) {
        controlsText.innerText = isMobile
            ? "Left side = Move • Right side = Look"
            : "WASD to move • Mouse to look • ESC to unlock";
    }

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        800
    );

    renderer = new THREE.WebGLRenderer({ antialias:true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    yawObject = new THREE.Object3D();
    pitchObject = new THREE.Object3D();

    yawObject.position.copy(SPAWN);
    yawObject.add(pitchObject);
    pitchObject.add(camera);
    scene.add(yawObject);

    playerBaseY = SPAWN.y - playerHeight;

    const pmrem = new THREE.PMREMGenerator(renderer);

    new RGBELoader()
        .setPath("assets/")
        .load("fouriesburg_mountain_midday_2k.hdr", (hdrTexture) => {
            hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
            hdrTexture.center.set(0.5, 0.5);
            hdrTexture.rotation = Math.PI / 2;

            scene.background = hdrTexture;
            scene.environment = pmrem.fromEquirectangular(hdrTexture).texture;

            pmrem.dispose();
        });

    await MeshoptDecoder.ready;

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    loader.load("assets/scene.glb", (gltf) => {
        model = gltf.scene;

        model.traverse((child) => {
            if (
                child.isMesh &&
                child.material &&
                child.material.name === "M_Glass_Darker"
            ) {
                child.material = new THREE.MeshPhysicalMaterial({
                    color: 0xffffff,
                    transmission: 1,
                    transparent: true,
                    opacity: 0.08,
                    roughness: 0,
                    metalness: 0,
                    thickness: 0,
                    ior: 1.45,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
            }
        });

        scene.add(model);
        console.log("GLB loaded");
    });

    if (!isMobile) {

        startScreen.addEventListener("click", () => {
            document.body.requestPointerLock();
        });

        document.addEventListener("pointerlockchange", () => {
            if (document.pointerLockElement === document.body) {
                startScreen.style.display = "none";
                canMove = true;
            } else {
                startScreen.style.display = "flex";
                canMove = false;
            }
        });

        document.addEventListener("mousemove", (e) => {
            if (document.pointerLockElement !== document.body) return;

            yawObject.rotation.y -= e.movementX * 0.002;

            pitch -= e.movementY * 0.002;
            pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
            pitchObject.rotation.x = pitch;
        });

    } else {

        startScreen.addEventListener("click", async () => {
            startScreen.style.display = "none";
            canMove = true;

            if (document.documentElement.requestFullscreen) {
                try {
                    await document.documentElement.requestFullscreen();
                } catch(e) {}
            }

            setupMobileControls();
        });
    }

    document.addEventListener("keydown", (e) => {
        if (e.code === "KeyW") move.forward = true;
        if (e.code === "KeyS") move.backward = true;
        if (e.code === "KeyA") move.left = true;
        if (e.code === "KeyD") move.right = true;
    });

    document.addEventListener("keyup", (e) => {
        if (e.code === "KeyW") move.forward = false;
        if (e.code === "KeyS") move.backward = false;
        if (e.code === "KeyA") move.left = false;
        if (e.code === "KeyD") move.right = false;
    });

    animate();
}

function setupMobileControls() {

    if (document.querySelector(".joystick")) return;

    const joystick = document.createElement("div");
    joystick.className = "joystick";
    document.body.appendChild(joystick);

    const stick = document.createElement("div");
    stick.className = "stick";
    joystick.appendChild(stick);

    let joystickTouchId = null;
    let lookTouchId = null;

    let centerX = 0;
    let centerY = 0;

    let lastLookX = 0;
    let lastLookY = 0;

    document.addEventListener("touchstart", (e) => {
        for (let touch of e.changedTouches) {

            if (touch.clientX < window.innerWidth / 2 && joystickTouchId === null) {
                joystickTouchId = touch.identifier;

                const rect = joystick.getBoundingClientRect();
                centerX = rect.left + rect.width / 2;
                centerY = rect.top + rect.height / 2;
            }

            else if (touch.clientX >= window.innerWidth / 2 && lookTouchId === null) {
                lookTouchId = touch.identifier;
                lastLookX = touch.clientX;
                lastLookY = touch.clientY;
            }
        }
    }, { passive:false });

    document.addEventListener("touchmove", (e) => {
        e.preventDefault();

        for (let touch of e.changedTouches) {

            if (touch.identifier === joystickTouchId) {

                const dx = touch.clientX - centerX;
                const dy = touch.clientY - centerY;

                const dist = Math.min(Math.sqrt(dx*dx + dy*dy), 40);
                const angle = Math.atan2(dy, dx);

                stick.style.transform =
                    `translate(${Math.cos(angle)*dist}px, ${Math.sin(angle)*dist}px)`;

                move.forward = dy < -10;
                move.backward = dy > 10;
                move.left = dx < -10;
                move.right = dx > 10;
            }

            if (touch.identifier === lookTouchId) {

                const deltaX = touch.clientX - lastLookX;
                const deltaY = touch.clientY - lastLookY;

                lastLookX = touch.clientX;
                lastLookY = touch.clientY;

                yawObject.rotation.y -= deltaX * 0.002;

                pitch -= deltaY * 0.002;
                pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
                pitchObject.rotation.x = pitch;
            }
        }
    }, { passive:false });

    document.addEventListener("touchend", (e) => {
        for (let touch of e.changedTouches) {

            if (touch.identifier === joystickTouchId) {
                joystickTouchId = null;
                stick.style.transform = "translate(0,0)";

                move.forward = false;
                move.backward = false;
                move.left = false;
                move.right = false;
            }

            if (touch.identifier === lookTouchId) {
                lookTouchId = null;
            }
        }
    });
}

function animate(){
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (canMove && model){

        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();

        const movement = new THREE.Vector3();

        if (move.forward) movement.add(forward);
        if (move.backward) movement.addScaledVector(forward, -1);
        if (move.left) movement.addScaledVector(right, -1);
        if (move.right) movement.add(right);

        if (movement.length() > 0){
            movement.normalize();
            movement.multiplyScalar(speed * delta);
        }

        const proposed = yawObject.position.clone().add(movement);

        if (movement.length() > 0){
            const midHeight = playerBaseY + playerHeight * 0.5;

            const ray = new THREE.Raycaster(
                new THREE.Vector3(
                    yawObject.position.x,
                    midHeight,
                    yawObject.position.z
                ),
                movement.clone().normalize(),
                0,
                playerRadius
            );

            const hits = ray.intersectObject(model, true);

            if (hits.length === 0){
                yawObject.position.copy(proposed);
            }
        }

        const footRay = new THREE.Raycaster(
            new THREE.Vector3(
                yawObject.position.x,
                playerBaseY + stepHeight,
                yawObject.position.z
            ),
            new THREE.Vector3(0,-1,0),
            0,
            stepHeight + 0.5
        );

        const groundHits = footRay.intersectObject(model, true);

        if (groundHits.length > 0){
            playerBaseY = groundHits[0].point.y;
        }

        yawObject.position.y = playerBaseY + playerHeight;
    }

    renderer.render(scene, camera);
}
