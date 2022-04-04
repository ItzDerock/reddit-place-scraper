# Reddit r/place scraper
A script designed to download and stitch together all the parts of r/place.

**Example output from 4/4/2022 @ 12:00 PM EST**
![example output](https://img.derock.dev/3Y1PbI.png)

## To use
You will need the following:
- Node.js v16+ (may work in older versions, haven't tested)
- A working reddit account

> ⚠️ Depending on your system, node-canvas (the library used to stitch together the different grid parts) may need to compile on your system. 
> You will need the dependencies listed [here](https://github.com/Automattic/node-canvas#compiling) if this is the case.

Steps to use:
1. `git clone` this repo or download and extract it.
2. Run `npm install` to install the dependencies.
3. Copy `.env.example` and name it `.env`
    1. `R_USERNAME` and `R_PASSWORD` is your reddit account username/pass (it will only be sent to reddit for oauth)
    2. `APP_NAME`, `OAUTH_CLIENT`, and `OAUTH_SECRET` can be obtained by creating an application [here](https://www.reddit.com/prefs/apps)
        ![configuration details](https://img.derock.dev/hI7Ps4.png)
    3. *Alternatively* you can set the `AUTH_TOKEN` to an existing and valid OAUTH token to use that instead of having the script authenticate.
4. Run `node .` to start the program.

Output files will appear in the `images` folder relative to the program. 
The images will be named in the following format: `{timestamp}-{grid id or combined}.png`