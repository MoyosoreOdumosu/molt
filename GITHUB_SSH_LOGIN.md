# Log in to GitHub from terminal (SSH)

**What’s going on:**  
- `git config user.email` (omoyosore66@gmail.com) only sets the **author** on commits.  
- **Who can push** is decided by which **GitHub account** your SSH key is linked to.  
- Right now your SSH key (`~/.ssh/id_rsa.pub`) is linked to **dodumosu**, so GitHub sees you as dodumosu.  
- To push to **MoyosoreOdumosu/molt** you must authenticate as **MoyosoreOdumosu**.

---

## Option A: Use MoyosoreOdumosu (add this key to that account)

1. **Log in to GitHub as MoyosoreOdumosu** in your browser (omoyosore66@gmail.com).
2. Open: **https://github.com/settings/keys**
3. Click **New SSH key** → Title: e.g. `Mac terminal` → Key: paste your public key.
4. Copy your public key to the clipboard:
   ```bash
   cat ~/.ssh/id_rsa.pub | pbcopy
   ```
   Paste (Cmd+V) into the Key field on GitHub, then **Add SSH key**.
5. Push:
   ```bash
   cd /Users/user/Desktop/molt
   git push -u origin main
   ```

---

## Option B: Push as dodumosu (use dodumosu’s repo)

If you prefer to keep using the dodumosu account:

1. Create a repo **dodumosu/molt** on GitHub (https://github.com/new).
2. Point origin at it and push:
   ```bash
   cd /Users/user/Desktop/molt
   git remote set-url origin git@github.com:dodumosu/molt.git
   git push -u origin main
   ```
