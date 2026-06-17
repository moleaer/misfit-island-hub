$file = "public\index.html"
$content = Get-Content $file -Raw -Encoding UTF8

# Patch 1: Add agendaItems section to renderExtractResults and move Close Meeting button outside decisions block
$old1 = '    html += `<div class="btn-row"><button class="btn btn-primary btn-sm" onclick=''importDecisions(${JSON.stringify(data.decisions)})''>Import Checked</button></div></div>`;
  html += `<div style="margin-top:16px;padding:14px;background:var(--offwhite);border-radius:10px;border:1.5px solid var(--border)">
    <div style="font-size:13px;font-weight:700;color:var(--text-dark);margin-bottom:6px">&#127937; Close Meeting</div>
    <div style="font-size:12px;color:var(--text-mid);margin-bottom:10px">Archive the current agenda so it starts fresh next week. Only do this after importing actions and decisions.</div>
    <button class="btn btn-secondary" onclick="archiveCurrentAgenda()" style="width:100%">&#128451; Archive Agenda &amp; Close Meeting</button>
  </div>`;
  }'

$new1 = '    html += `<div class="btn-row"><button class="btn btn-primary btn-sm" onclick=''importDecisions(${JSON.stringify(data.decisions)})''>Import Checked</button></div></div>`;
  }

  if (data.agendaItems?.length) {
    html += `<div class="extract-card" style="margin-top:10px"><div class="extract-hdr"><span style="font-size:20px">&#128203;</span><div class="extract-title">Next Week Agenda (${data.agendaItems.length})</div></div>`;
    data.agendaItems.forEach((item,i) => {
      html += `<div class="extract-item">
        <input type="checkbox" class="extract-check" id="eag-${i}" checked>
        <div class="extract-text"><strong>${item.topic}</strong>${item.presenter ? ` &middot; <em>${item.presenter}</em>` : ""}${item.notes ? `<div style="font-size:11px;color:var(--text-xlt);margin-top:2px">${item.notes}</div>` : ""}</div>
        <span class="badge badge-gray">${item.section} &middot; ${item.duration}m</span>
      </div>`;
    });
    html += `<div class="btn-row"><button class="btn btn-primary btn-sm" onclick=''importAgendaItems(${JSON.stringify(data.agendaItems)})''>Import Checked</button></div></div>`;
  }

  html += `<div style="margin-top:16px;padding:14px;background:var(--offwhite);border-radius:10px;border:1.5px solid var(--border)">
    <div style="font-size:13px;font-weight:700;color:var(--text-dark);margin-bottom:6px">&#127937; Close Meeting</div>
    <div style="font-size:12px;color:var(--text-mid);margin-bottom:10px">Archive the current agenda so it starts fresh next week. Only do this after importing actions and decisions.</div>
    <button class="btn btn-secondary" onclick="archiveCurrentAgenda()" style="width:100%">&#128451; Archive Agenda &amp; Close Meeting</button>
  </div>`;'

# Patch 2: Add importAgendaItems function after importDecisions
$old2 = "  showToast('Decisions logged'); showPanel('decisions'); renderDecisions();
}"

$new2 = "  showToast('Decisions logged'); showPanel('decisions'); renderDecisions();
}

function importAgendaItems(items) {
  const weekOf = getWeekOf();
  items.forEach((item, i) => {
    if (document.getElementById(`eag-`+i)?.checked) {
      const newItem = {
        id: nextAgendaId++,
        topic: item.topic,
        presenter: item.presenter || '',
        section: item.section || 'Other',
        duration: item.duration || 5,
        notes: item.notes || '',
      };
      agendaItems.push(newItem);
      saveToNotion('agenda', {
        topic: newItem.topic, presenter: newItem.presenter,
        section: newItem.section, duration: newItem.duration,
        notes: newItem.notes, weekOf,
      }).then(id => { if (id) newItem.notionId = id; });
    }
  });
  showToast('Agenda items added for next week'); showPanel('agenda'); renderAgenda();
}"

if ($content -match [regex]::Escape("importAgendaItems")) {
    Write-Host "Changes already applied - nothing to do"
} else {
    if ($content -match [regex]::Escape("showToast('Decisions logged'); showPanel('decisions'); renderDecisions();")) {
        $content = $content.Replace($old2, $new2)
        Write-Host "Patch 2 applied"
    } else {
        Write-Host "WARNING: Could not find patch 2 anchor"
    }
    $content | Set-Content $file -Encoding UTF8 -NoNewline
    Write-Host "File saved"
}
