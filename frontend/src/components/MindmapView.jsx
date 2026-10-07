import { useEffect, useRef } from 'react';
import { Mindmap } from '../lib/mindmap.js';

// Wrapper React untuk mindmap vanilla.
// - Render ulang hanya saat `version` berubah (mindmap baru dari AI / hasil revisi).
// - Edit inline di dalam mindmap TIDAK memicu render ulang; perubahan disalurkan
//   lewat onChange ke ref parent (tanpa setState) agar UI tidak berkedip/reset.
export default function MindmapView({ data, version, onChange, onReviseFeature }) {
  const ref = useRef(null);
  const cbRef = useRef(null);
  cbRef.current = { onChange: onChange, onReviseFeature: onReviseFeature };
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(function () {
    const el = ref.current;
    if (!el) return;
    try {
      Mindmap.render(el, dataRef.current, {
        onChange: function (d) { if (cbRef.current.onChange) cbRef.current.onChange(d); },
        reviseFeature: function (feature, instruction) {
          if (cbRef.current.onReviseFeature) return cbRef.current.onReviseFeature(feature, instruction);
          return Promise.reject(new Error('Revisi tidak tersedia.'));
        },
      });
    } catch (e) {
      el.innerHTML = '<p class="text-sm text-center py-10" style="color:var(--ink-faint)">Gagal memuat mindmap.</p>';
    }
    return function () { try { Mindmap.destroy(); } catch (_) {} };
  }, [version]);

  return <div ref={ref} className="mm-host" />;
}
