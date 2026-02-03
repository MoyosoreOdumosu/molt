# Push to GitHub, run workflow, download image

## 1. Push to GitHub

The repo is committed locally and the remote is set to `https://github.com/QuantumTheAlchemeist/molt.git`.

1. **Create the repository on GitHub** (once):
   - Go to https://github.com/new
   - Repository name: `molt`
   - Leave it empty (no README, no .gitignore), then **Create repository**

2. **Push** (from your machine):

   ```bash
   cd /Users/user/Desktop/molt
   git push -u origin main
   ```

   If you use SSH instead of HTTPS, change the remote first:

   ```bash
   git remote set-url origin git@github.com:QuantumTheAlchemeist/molt.git
   git push -u origin main
   ```

## 2. Run the Packer workflow

1. Open your repo on GitHub: https://github.com/QuantumTheAlchemeist/molt
2. Click **Actions**
3. In the left sidebar, click **Packer image (Ubuntu)**
4. Click **Run workflow** (right side), then **Run workflow** again
5. Wait for the job to finish (about 30–60 minutes; it builds the Ubuntu image in QEMU)

## 3. Download the image artifact

1. When the run is green, click the run (e.g. “Add Packer image…”)
2. In the **Artifacts** section at the bottom, click **moltbot-ubuntu-22.04**
3. The zip is downloaded; unzip it to get the image folder with the qcow2 file

The image is in: `moltbot-ubuntu-22.04/packer-ubuntu` (qcow2 disk).
