import { Link } from 'react-router-dom';

const STEPS = [
  ['Siapkan folder proyek.', <>Buat folder baru, taruh keempat file di dalamnya. <code>AGENTS.md</code> harus di root (sejajar folder <code>src/</code>), bukan di subfolder — kalau di subfolder, agent tidak membacanya otomatis.</>],
  ['Buka folder di AI agent.', <>Contoh di Antigravity: <em>Open Folder</em> → pilih folder proyekmu.</>],
  ['Mulai dengan prompt konteks', <>(contoh siap pakai di bawah). Jangan langsung "buatkan aplikasinya".</>],
  ['Kerjakan per task', <>dari <code>tech_spec.md</code>. Satu fitur selesai → review hasilnya → baru lanjut ke task berikutnya.</>],
  ['Setiap bikin UI', <>suruh agent merujuk <code>design.md</code> — warna, font, dan komponen sudah ditentukan di sana.</>],
];

export default function Panduan() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link to="/riwayat" className="text-sm muted hover-ink">← Riwayat</Link>
      <h1 className="text-3xl sm:text-4xl font-extrabold ink font-display mt-4">📖 Cara Pakai Dokumen .md</h1>
      <p className="muted mt-3">File yang kamu download dari AutoPRD.id bukan arsip pajangan — ini <strong className="ink">bahan bakar</strong> buat AI coding agent seperti Antigravity, Cursor, atau Claude Code. Berikut cara pakai yang benar.</p>

      <div className="md-body">
        <h2>1. Kenali 4 file-mu</h2>
        <table>
          <tbody>
            <tr><th>File</th><th>Isi</th><th>Peran</th></tr>
            <tr><td><code>PRD.md</code></td><td>Apa &amp; kenapa aplikasi ini dibuat</td><td>Konteks besar — kasih di awal</td></tr>
            <tr><td><code>tech_spec.md</code></td><td>Cara teknis + checklist task per fitur</td><td>Panduan kerja bertahap</td></tr>
            <tr><td><code>AGENTS.md</code></td><td>Aturan main: perintah, struktur, konvensi, deploy</td><td><strong>WAJIB di root proyek</strong> — agent baca otomatis</td></tr>
            <tr><td><code>design.md</code></td><td>Panduan visual: warna, font, komponen</td><td>Acuan setiap bikin UI</td></tr>
          </tbody>
        </table>

        <h2>2. Alur kerja yang benar</h2>
        <div className="space-y-4 mt-4">
          {STEPS.map(function (s, i) {
            return (
              <div className="flex gap-4 items-start card p-4" key={i}>
                <div className="step-num">{i + 1}</div>
                <p style={{ margin: 0 }}><strong>{s[0]}</strong> {s[1]}</p>
              </div>
            );
          })}
        </div>

        <h2>3. Contoh prompt di Antigravity</h2>
        <h3>Setup awal (sekali saja)</h3>
        <pre><code>{'Baca AGENTS.md, PRD.md, dan design.md sampai paham.\nLalu kerjakan task pertama dari tech_spec.md.\nJangan lanjut ke task berikutnya sebelum aku bilang OK.'}</code></pre>
        <h3>Lanjut per fitur</h3>
        <pre><code>{'Lanjut ke task berikutnya di tech_spec.md: "[nama fitur]".\nIkuti acceptance criteria yang tertulis di sana.'}</code></pre>
        <h3>Styling UI</h3>
        <pre><code>{'Buatkan halaman [nama halaman] mengikuti design.md —\npakai token warna dan gaya komponen yang sudah ditentukan.'}</code></pre>
        <h3>Minta agent cek kerjanya sendiri</h3>
        <pre><code>{'Cek ulang kode yang baru kamu tulis terhadap AGENTS.md\nbagian Konvensi. Perbaiki yang melanggar.'}</code></pre>

        <h2>4. Kalau pakai tool lain</h2>
        <ul>
          <li><strong>Cursor</strong> — taruh file di proyek, pakai <code>@AGENTS.md</code> / <code>@PRD.md</code> di chat untuk merujuk file tertentu.</li>
          <li><strong>Claude Code</strong> — jalankan dari folder proyek; ia otomatis membaca <code>AGENTS.md</code> di root.</li>
          <li><strong>ChatGPT / Claude web</strong> — upload keempat file sebagai attachment, lalu pakai prompt yang sama seperti di atas.</li>
        </ul>

        <h2>5. Tips penting</h2>
        <ul>
          <li>✅ Satu task satu sesi — jangan "buatkan semuanya sekaligus".</li>
          <li>✅ Selalu review diff/hasil sebelum lanjut ke task berikutnya.</li>
          <li>✅ Commit (atau simpan versi) tiap task selesai.</li>
          <li>✅ Kalau agent ngawur, tunjuk bagian spesifik: <em>"lihat tech_spec.md bagian X"</em>.</li>
          <li>✅ Jangan ubah <code>AGENTS.md</code> manual kecuali memang perlu.</li>
        </ul>

        <h2>6. Kesalahan umum</h2>
        <ul>
          <li>❌ Paste semua file jadi satu prompt raksasa.</li>
          <li>❌ Langsung minta "buatkan full aplikasi" tanpa tahapan.</li>
          <li>❌ Tidak membaca hasil sebelum lanjut.</li>
          <li>❌ <code>AGENTS.md</code> ditaruh di subfolder.</li>
          <li>❌ Mengubah requirement di tengah jalan tanpa memperbarui PRD.</li>
        </ul>
      </div>

      <div className="mt-10 text-center">
        <Link to="/riwayat" className="text-sm muted hover-ink">← Kembali ke Riwayat</Link>
      </div>
    </div>
  );
}
