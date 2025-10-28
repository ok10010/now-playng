import * as vscode from 'vscode';
import { exec } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
  let panel: vscode.WebviewPanel | undefined;
  let lastArtwork = '';
  let lastTrackText = '';
  let lastPosition = 0;
  let lastDuration = 1;
  let lastState: string = 'stopped';

  const trackItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  trackItem.text = '🎧 Spotify: Idle';
  trackItem.show();

  const toggleButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  toggleButton.text = '🎵';
  toggleButton.tooltip = 'Show / Hide Spotify Mini Player';
  toggleButton.command = 'spotify-mini-player.toggle';
  toggleButton.show();

  context.subscriptions.push(
    vscode.commands.registerCommand('spotify-mini-player.toggle', () => {
      if (panel) {
        panel.dispose();
        panel = undefined;
      } else {
        openMiniPlayer();
      }
    }),
    trackItem,
    toggleButton
  );

  function updateTrack() {
    exec(
      `osascript -e 'tell application "Spotify"
        if player state is playing or player state is paused then
          set trackName to name of current track
          set artistName to artist of current track
          set artworkUrl to artwork url of current track
          set pos to player position
          set dur to duration of current track / 1000
          return trackName & "||" & artistName & "||" & artworkUrl & "||" & pos & "||" & dur & "||" & player state
        else
          return "STOPPED"
        end if
      end tell'`,
      (err, stdout) => {
        const text = stdout.trim();
        if (!text || text === 'STOPPED') {
          trackItem.text = '🔇 Nothing playing';
          lastState = 'stopped';
          panel?.webview.postMessage({ type: 'stopped' });
          return;
        }

        const [title, artist, artwork, posStr, durStr, state] = text.split('||');
        lastArtwork = artwork;
        lastTrackText = `${artist} — ${title}`;
        lastPosition = parseFloat(posStr) || 0;
        lastDuration = parseFloat(durStr) || 1;
        lastState = state;

        trackItem.text = state === 'paused' ? `⏸ ${lastTrackText}` : `🎵 ${lastTrackText}`;

        if (panel) {
          panel.webview.postMessage({
            type: 'update',
            title,
            artist,
            artwork,
            pos: lastPosition,
            dur: lastDuration,
            state
          });
        }
      }
    );
  }

  setInterval(updateTrack, 1000);
  updateTrack();

  function openMiniPlayer() {
    panel = vscode.window.createWebviewPanel(
      'spotifyMiniPlayer',
      '🎧 Spotify Mini Player',
      vscode.ViewColumn.Two,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.webview.html = getWebviewContent();

    // отправляем текущее состояние
    setTimeout(() => {
      if (lastTrackText && lastState !== 'stopped') {
        const [artist, title] = lastTrackText.split(' — ');
        panel?.webview.postMessage({
          type: 'update',
          title: title || '',
          artist: artist || '',
          artwork: lastArtwork,
          pos: lastPosition,
          dur: lastDuration,
          state: lastState
        });
      }
    }, 300);

    panel.onDidDispose(() => (panel = undefined), null, context.subscriptions);

    panel.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'playpause') exec(`osascript -e 'tell application "Spotify" to playpause'`);
      else if (msg.command === 'next') exec(`osascript -e 'tell application "Spotify" to next track'`);
      else if (msg.command === 'prev') exec(`osascript -e 'tell application "Spotify" to previous track'`);
    }, undefined, context.subscriptions);
  }
}

export function deactivate() {}

function getWebviewContent() {
  return /* html */ `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <style>
      html, body { margin:0; height:100%; font-family:'Inter',sans-serif;
        background:#0b0b0c; color:#fff; overflow:hidden;
        display:flex; align-items:center; justify-content:center;}
      #bg {position:fixed; inset:0; background-position:center; background-size:cover;
        filter:blur(36px) brightness(0.45); z-index:0; opacity:0; transition:opacity 0.4s ease;}
      .wrap {position:relative; z-index:1; display:flex; flex-direction:column; align-items:center;
        opacity:0; transform:scale(0.95); transition:opacity 0.35s ease, transform 0.35s ease;}
      .cover {width:160px;height:160px;border-radius:12px; overflow:hidden;margin-bottom:14px;}
      .cover img {width:100%;height:100%; object-fit:cover;}
      .meta {text-align:center; margin-bottom:12px;}
      .title {font-weight:600; font-size:16px; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
      .artist {font-size:13px;color:rgba(255,255,255,0.7); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
      .controls {display:flex; gap:12px; margin-bottom:10px;}
      .btn {width:40px; height:40px; border:none; border-radius:8px;
        background: rgba(255,255,255,0.05); cursor:pointer; display:flex;
        align-items:center; justify-content:center; transition:background 0.2s, transform 0.2s, box-shadow 0.2s;}
      .btn:hover { background: rgba(255,255,255,0.12); transform:scale(1.05); box-shadow:0 0 12px rgba(122,92,255,0.35);}
      .wave {display:flex; align-items:flex-end; justify-content:center; gap:4px; height:24px; margin-bottom:8px;}
      .bar {width:4px; border-radius:2px; background:#7a5cff; transition: height 0.1s ease, background 0.3s ease;}
      .progress-container {width:88%; max-width:360px; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;}
      .progress {width:0%; height:100%; background:#7a5cff; transition:width 0.3s linear;}
    </style>
  </head>
  <body>
    <div id="bg"></div>
    <div class="wrap" id="wrap">
      <div class="cover"><img id="coverImg" src="" alt="cover"></div>
      <div class="meta">
        <div id="title" class="title">Nothing playing</div>
        <div id="artist" class="artist"></div>
      </div>
      <div class="controls">
        <button class="btn" onclick="send('prev')">⏮</button>
        <button class="btn" onclick="send('playpause')">⏯</button>
        <button class="btn" onclick="send('next')">⏭</button>
      </div>
      <div class="wave" id="wave"></div>
      <div class="progress-container"><div id="progress" class="progress"></div></div>
    </div>

    <script>
      const vscode = acquireVsCodeApi();
      const bg = document.getElementById('bg');
      const wrap = document.getElementById('wrap');
      const coverImg = document.getElementById('coverImg');
      const titleEl = document.getElementById('title');
      const artistEl = document.getElementById('artist');
      const wave = document.getElementById('wave');
      const progressBar = document.getElementById('progress');

      // fade-in
      setTimeout(()=>{bg.style.opacity=1; wrap.style.opacity=1; wrap.style.transform='scale(1)';},50);

      // 16 bars
      const BAR_COUNT=16;
      for(let i=0;i<BAR_COUNT;i++){
        const b=document.createElement('div'); b.className='bar'; 
        b.style.height=(4+Math.random()*12)+'px'; wave.appendChild(b);
      }

      // faster wave
      setInterval(()=>{
        document.querySelectorAll('.bar').forEach(bar=>{bar.style.height=(4+Math.random()*12)+'px';});
      },100);

      window.addEventListener('message', event=>{
        const msg = event.data;
        if(msg.type==='update' || msg.type==='paused'){
          titleEl.textContent = msg.title||'Unknown';
          artistEl.textContent = msg.artist||'';
          if(msg.artwork){ coverImg.src=msg.artwork; bg.style.backgroundImage="url('"+msg.artwork+"')"; }

          // progress bar real
          if(msg.pos !== undefined && msg.dur > 0){
            const perc = Math.min(100, (msg.pos/msg.dur)*100);
            progressBar.style.width = perc + '%';
          }

          // wave color
          const accent='#7a5cff';
          document.querySelectorAll('.bar').forEach(bar=>bar.style.background=accent);
          progressBar.style.background=accent;
        }
      });

      function send(cmd){ vscode.postMessage({command:cmd}); }
    </script>
  </body>
  </html>
  `;
}