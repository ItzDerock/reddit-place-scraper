require('dotenv').config();

const WebsocketClient = require('ws');
const fs = require('fs');
const assert = require('assert');
const axios = require('axios').default;
const { createCanvas, loadImage } = require('canvas');

// create images folder
if(!fs.existsSync('images')) fs.mkdirSync('images');

const UA = `${process.env.APP_NAME}/${require('./package.json').version}`;

var auth_token = {
    token: process.env.AUTH_TOKEN,
    expires: process.env.AUTH_TOKEN ? -1 : null
};

async function doAuth() {
    if(auth_token.expires === -1 && auth_token.token) 
        return auth_token.token;

    if(auth_token.expires > Date.now() && auth_token.token)
        return auth_token.token;

    try {
        const response = await axios.post(`https://www.reddit.com/api/v1/access_token?grant_type=password&username=${process.env.R_USERNAME}&password=${process.env.R_PASSWORD}`, {}, {
            auth: {
                username: process.env.OAUTH_CLIENT,
                password: process.env.OAUTH_SECRET
            },
            headers: {
                'User-Agent': UA
            }
        });

        assert(response.data.access_token, 'No access token');

        auth_token = {
            token: response.data.access_token,
            expires: Date.now() + (response.data.expires_in * 1000)
        }

        return auth_token.token;
    } catch (error) {
        console.error('< Failed to authenticate', error);
        return null;
    }
}

var currentConfig = {};
var images = [];
var startDate = Date.now();

// Main function
async function main() {
    // Reset state
    currentConfig = {};
    images = [];
    startDate = Date.now();

    // Authenticate
    console.log('> Authenticating');
    const token = await doAuth();
    if(!token) return console.log('< Authentication Unsuccessful.');
    console.log('< Authentication successful.');

    // Connect to websocket
    console.log('> Connecting to websocket...');
    const ws = new WebsocketClient("wss://gql-realtime-2.reddit.com/query", {
        headers: {
            'User-Agent': UA,
            'Origin': 'https://hot-potato.reddit.com' // < REQUIRED OR ELSE YOU WILL GET 403
        }
    });

    // Listen for when the websocket is open
    ws.on('open', () => {
        console.log('> Connected to websocket.');

        // Authenticate
        ws.send(`{"type":"connection_init","payload":{"Authorization":"Bearer ${auth_token.token}"}}`);
        // Subscribe to r/place
        ws.send('{"id":"1","type":"start","payload":{"variables":{"input":{"channel":{"teamOwner":"AFD2022","category":"CONFIG"}}},"extensions":{},"operationName":"configuration","query":"subscription configuration($input:SubscribeInput!){subscribe(input:$input){id...on BasicMessage{data{__typename...on ConfigurationMessageData{colorPalette{colors{hex index __typename}__typename}canvasConfigurations{index dx dy __typename}canvasWidth canvasHeight __typename}}__typename}__typename}}"}}')
    });

    ws.on('message', message => {
        // Parse incomming messages
        const payload = JSON.parse(message);

        // Return if a connection error occured.
        if(payload.type === 'connection_error') {
            console.error(`< Connection error: `, payload);
            return;
        }

        // Ignore non-data messages
        if(payload.type !== 'data') return;

        // Check if is a configuration message
        if(payload?.payload?.data?.subscribe?.data?.__typename === "ConfigurationMessageData") {
            var messageIndex = 2;
            var canvasConfig = payload?.payload?.data?.subscribe?.data?.canvasConfigurations;

            console.log(`< Received canvas config`);

            // Update local config
            for(let configItem of canvasConfig) {
                if(configItem?.__typename === "CanvasConfiguration") {
                    let itemIndex = configItem.index;
                    currentConfig[itemIndex] = {
                        url: null,
                        completed: false,
                        dx: configItem.dx,
                        dy: configItem.dy
                    }
                }
            }

            // Rrequest for images
            for(let index of Object.keys(currentConfig)) {
                ws.send(`{"id":"${messageIndex}","type":"start","payload":{"variables":{"input":{"channel":{"teamOwner":"AFD2022","category":"CANVAS","tag":"${index}"}}},"extensions":{},"operationName":"replace","query":"subscription replace($input:SubscribeInput!){subscribe(input:$input){id...on BasicMessage{data{__typename...on FullFrameMessageData{__typename name timestamp}...on DiffFrameMessageData{__typename name currentTimestamp previousTimestamp}}__typename}__typename}}"}}`);
                messageIndex += 1;
            }

            return;
        }

        // Check if it is full frame data
        if(payload?.payload?.data?.subscribe?.data?.__typename == "FullFrameMessageData") {
            let url = payload?.payload?.data?.subscribe?.data?.name;
            let extractedIndex = parseInt(url.match(/[0-9]{13}-([0-9]{1})/)[1]);
            currentConfig[extractedIndex].url = url;
            // get image
            console.log('> Requesting image for frame id: ' + extractedIndex + ` (${url})`);
            fetchImageFromUrl(url, extractedIndex, ws);
        }
    });
};

/**
 * 
 * @param {string} url 
 * @param {number} index 
 * @param {WebsocketClient} ws 
 */
async function fetchImageFromUrl(url, index, ws) {
    const response = await axios.get(url, { responseType: 'stream' });
    const filename = `images/${startDate}-${index}.png`;

    response.data.pipe(fs.createWriteStream(filename));

    // wait for response.data to finish
    await new Promise(resolve => response.data.on('end', resolve));

    currentConfig[index].completed = true;
    console.log(`< Fetched canvas ${index} (saved to ${filename})`);

    images.push({
        filename: filename,
        index: index,
        dx: currentConfig[index].dx,
        dy: currentConfig[index].dy
    });

    for(let configItem of Object.values(currentConfig)) {
        if(!configItem.completed) return;
    }


    console.log(`# All fetched at: ${startDate} (${new Date(startDate).toUTCString()})`);
    ws.close();

    // combine images
    await combineImages(images, `images/${startDate}-combined.png`);
    console.log(`# Combined images for ${startDate} (${new Date(startDate).toUTCString()}). File: images/${startDate}-combined.png`);
}

/**
 * 
 * @param {{
 *   filename: string,
 *   index: number,
 *   dx: number,
 *   dy: number
 * }[]} images
 * 
 * @param {string} outputFile
 */
async function combineImages(images, outputFile) {
    const heightX = parseInt(1000 * images.length / 2);
    const heightY = parseInt(1000 * images.length / 2);

    const canvas = createCanvas(heightX, heightY);
    const ctx = canvas.getContext('2d');

    for(let image of images) {
        const img = await loadImage(image.filename);
        ctx.drawImage(img, parseInt(image.dx), parseInt(image.dy));
    }

    const stream = canvas.createPNGStream();
    stream.pipe(fs.createWriteStream(outputFile));

    // return a promise that resolves when the stream is done
    return new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
    });
}

module.exports = {
    main,
    combineImages,
    fetchImageFromUrl
}

if(require.main === module) {
    main();
}