# Authenticate as MoyosoreOdumosu (omoyosore66) for this repo

A **dedicated SSH key** for GitHub is set up so Git uses **MoyosoreOdumosu** (not dodumosu) when you push to `github.com`.

## 1. Add this key to your MoyosoreOdumosu GitHub account (one-time)

1. **Log in to GitHub as MoyosoreOdumosu** (omoyosore66@gmail.com) in your browser.
2. Open: **https://github.com/settings/keys**
3. Click **New SSH key**.
4. **Title:** e.g. `Mac molt`
5. **Key:** paste this (the whole line):

   ```
   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKwNROFutwPk2Mac9sppyUJXZuXGr6yEkFdUSJfLJgwu omoyosore66@gmail.com
   ```

   Or copy from terminal: `cat ~/.ssh/id_ed25519_github_moyosore.pub | pbcopy`
6. Click **Add SSH key**.

## 2. Test and push

```bash
cd /Users/user/Desktop/molt
ssh -T git@github.com
git push -u origin main
```

You should see: **Hi MoyosoreOdumosu! You've successfully authenticated...**  
Then `git push -u origin main` will push as MoyosoreOdumosu.

---

**What was done:**  
- New key: `~/.ssh/id_ed25519_github_moyosore` (for omoyosore66 / MoyosoreOdumosu).  
- `~/.ssh/config` tells SSH to use this key for `github.com` only.  
- Your existing key (`id_rsa`) is still used for other hosts (e.g. dodumosu elsewhere).
