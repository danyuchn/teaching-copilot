# [Beginner's Setup Guide] How to Run Teaching Copilot

This document is designed for users who are **running code for the first time**. Please follow the instructions step by step.

---

## Step 1: Install Necessary Software (Node.js)

This program requires the Node.js environment to run.

1. Go to the Node.js official download page: [https://nodejs.org/](https://nodejs.org/)
2. Click the button on the left labeled **"LTS"** (LTS stands for Long Term Support, which is the most stable version).
3. Once downloaded, run the installer and **keep clicking "Next" until installation is complete**.

---

## Step 2: Configure Your Key (API Key)

The program needs a key to communicate with Google's AI.

1. In this folder (where you see this file), right-click in an empty space -> **New** -> **Text Document**.
2. Rename this file to `.env`.
   * **Note**: There is a dot `.` at the beginning of the filename.
   * **Note**: If the system asks if you want to change the file extension, select **"Yes"**.
   * **Note**: The filename **cannot** be `.env.txt`. If you are unsure, make sure "File name extensions" is checked in your View settings.
3. Open this `.env` file with **Notepad**.
4. Paste the following content inside (replace `YOUR_API_KEY` with your actual key):

```text
API_KEY=AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

5. Save the file and close it.

---

## Step 3: Install the Application

Now we need to let the computer automatically download the parts needed for the program.

1. Right-click in an empty space in this folder.
   * **Windows 11 Users**: Select **"Open in Terminal"**.
   * **Windows 10 or Mac Users**: If you don't see this option, hold down the `Shift` key on your keyboard, then right-click, and select **"Open PowerShell window here"** or **"Open Command window here"**.
2. Once the black or blue window appears, type the following command and press **Enter**:

```bash
npm install
```

3. It is normal to see a lot of text scrolling. Please wait until it finishes (until a new input cursor appears).

---

## Step 4: Launch the Program!

1. In the same window, type the following command and press **Enter**:

```bash
npm run dev
```

2. Wait a few seconds, you should see a message similar to this:

```
  VITE v5.4.1  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

3. At the same time, your browser should **automatically open** the Teaching Copilot interface. If not, manually open your browser and enter `http://localhost:5173`.

---

## FAQ

**Q: The screen says "Missing API Key", what should I do?**
A: This means the `.env` file in Step 2 was not set up correctly. Please check:
1. Is the filename `.env.txt` instead of `.env`? (It must be exactly `.env`)
2. Is the content `API_KEY=YOUR_KEY`? (No spaces around the equals sign, no quotes around the key)
3. After fixing it, go to the black window, press `Ctrl + C` to stop the program, and type `npm run dev` again to restart.

**Q: How do I close the program?**
A: In that black/blue window, press `Ctrl + C` on your keyboard.
