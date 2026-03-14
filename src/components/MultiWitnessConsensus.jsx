import { useState, useEffect } from 'react';

const MultiWitnessConsensus = ({ witnesses, apiKey, returnPhase }) => {
  const [isMerging, setIsMerging] = useState(true);
  const [consensusImage, setConsensusImage] = useState(null);
  const [agreedTraits, setAgreedTraits] = useState([]);
  const [dissimilarTraits, setDissimilarTraits] = useState([]);

  const confirmedWitnesses = witnesses.filter(w => w.selectedCandidate);

  useEffect(() => {
    const doFusion = async () => {
      setIsMerging(true);

      // Analyze traits for agreement vs discrepancy
      const traitsSummary = {}; // key -> { values: Set, list: [] }
      confirmedWitnesses.forEach(w => {
        Object.entries(w.structuredTraits).forEach(([key, trait]) => {
          if (!traitsSummary[key]) traitsSummary[key] = { values: new Set(), list: [] };
          traitsSummary[key].values.add(trait.value.toLowerCase().trim());
          traitsSummary[key].list.push(trait.value);
        });
      });

      const agreed = [];
      const dissimilar = [];

      Object.entries(traitsSummary).forEach(([key, summary]) => {
        const readableKey = key.replaceAll('_', ' ');
        if (summary.values.size === 1) {
          agreed.push({ key: readableKey, value: summary.list[0] });
        } else {
          dissimilar.push({ key: readableKey, values: Array.from(summary.values) });
        }
      });

      setAgreedTraits(agreed);
      setDissimilarTraits(dissimilar);

      // Construct advanced prompt
      const agreedPrompt = agreed.map(t => `${t.key}: ${t.value}`).join(', ');
      const dissimilarPrompt = dissimilar.map(t => `${t.key}: blend of ${t.values.join(' and ')}`).join(', ');

      const imageParts = confirmedWitnesses.map(w => {
        const matchedCand = w.candidates.find(c => c.id === w.selectedCandidate);
        if (matchedCand?.image && matchedCand.image.startsWith('data:')) {
          const [header, base64Data] = matchedCand.image.split(',');
          const mimeType = header.split(':')[1].split(';')[0];
          return {
            inlineData: { mimeType, data: base64Data }
          };
        }
        return null;
      }).filter(Boolean);

      const genderVal = agreed.find(t => t.key === 'gender')?.value ||
                        dissimilar.find(t => t.key === 'gender')?.values[0] ||
                        'person';
      const isFemale = genderVal.toLowerCase().includes('female') || genderVal.toLowerCase().includes('woman');
      const genderAnchor = isFemale ? "A passport-style identification portrait of a woman" : "A passport-style identification portrait of a man";

      const fusionPrompt = [
        `FUSE and MERGE the provided images into a single consensus forensic composite. Subject MUST be ${isFemale ? 'FEMALE' : 'MALE'}.`,
        genderAnchor,
        agreed.length > 0 ? `ENSURE these shared features are definitive: ${agreedPrompt}` : '',
        dissimilar.length > 0 ? `RECONCILE these discrepancies into a natural blend: ${dissimilarPrompt}` : '',
        'Output must be a clean centered ID-style portrait with no text overlays or markings.'
      ].filter(Boolean).join('. ');

      const styleExt = "single-subject passport photo style, face centered and straight to camera, head and upper shoulders visible, neutral plain background, balanced framing, photorealistic absolute high quality, consistent lighting, no dramatic shadows, NO text, NO numbers, NO logos, NO watermark, NO frames, NO borders";
      const fullPrompt = `${fusionPrompt}. Style: ${styleExt}`;

      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: `${fullPrompt}. Consensus Variant ID: ${Math.random().toString(36).substring(7)}` },
                ...imageParts
              ]
            }],
            generationConfig: { responseModalities: ["IMAGE"] }
          })
        });
        const resData = await res.json();
        if (resData.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
          const inline = resData.candidates[0].content.parts[0].inlineData;
          setConsensusImage(`data:${inline.mimeType};base64,${inline.data}`);
        }
      } catch (err) {
        console.error("Fusion failed:", err);
      }
      setIsMerging(false);
    };

    if (confirmedWitnesses.length > 0 && isMerging) {
      doFusion();
    }
  }, [apiKey]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Multi-Witness Consensus</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Fusing independent accounts into a definitive target.</p>
        </div>
        <button className="btn" onClick={returnPhase}>← Back</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'start' }}>

        {/* Left Side: Witnesses */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h3 style={{ borderBottom: '1px solid var(--surface-border)', paddingBottom: '8px' }}>Individual Witness Matches</h3>
          {confirmedWitnesses.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No witnesses have confirmed a match yet.</p>
          ) : (
            confirmedWitnesses.map(w => {
              const matchedCand = w.candidates.find(c => c.id === w.selectedCandidate);
              return (
                <div key={w.id} className="glass-panel" style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '12px' }}>
                  <div style={{ width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', background: '#000' }}>
                    <img src={matchedCand?.image} alt={w.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{w.name}</h4>
                    <div style={{ color: 'var(--success)', fontSize: '0.85rem', fontWeight: 'bold' }}>Match Confirmed</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Side: Consensus */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', minHeight: '500px', position: 'relative' }}>
          {isMerging ? (
            <div style={{ textAlign: 'center' }}>
              <div className="animate-pulse" style={{ width: '64px', height: '64px', border: '4px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 24px', animation: 'spin 1s linear infinite' }}></div>
              <h3 className="animate-pulse">Reconciling Memory Discrepancies...</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Identifying common facial anchors across {confirmedWitnesses.length} witnesses</p>
            </div>
          ) : (
            <div className="animate-fade-in" style={{ textAlign: 'center', width: '100%' }}>
              <div
                className="glow-active"
                style={{
                  width: '100%',
                  maxWidth: '320px',
                  aspectRatio: '1/1',
                  background: '#000',
                  borderRadius: '24px',
                  overflow: 'hidden',
                  margin: '0 auto 32px',
                  boxShadow: '0 0 50px rgba(59, 130, 246, 0.3)',
                  border: '2px solid rgba(59, 130, 246, 0.6)'
                }}
              >
                <img src={consensusImage || "/placeholder_composite.png"} alt="Consensus Target" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <h2 style={{ marginBottom: '12px', fontSize: '2.2rem', letterSpacing: '-0.02em' }}>Target ID: 24-Alpha</h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '32px', textAlign: 'left' }}>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '16px', border: '1px solid var(--surface-border)' }}>
                  <h4 style={{ color: 'var(--success)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>✨</span> Shared Consensus
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {agreedTraits.length > 0 ? agreedTraits.map((t, idx) => (
                      <span key={idx} style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem' }}>
                        {t.key}: <b style={{ color: '#fff' }}>{t.value}</b>
                      </span>
                    )) : <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No perfect shared matches.</span>}
                  </div>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '16px', border: '1px solid var(--surface-border)' }}>
                  <h4 style={{ color: 'var(--warning)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>⚖️</span> Dissimilar Traits
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {dissimilarTraits.length > 0 ? dissimilarTraits.map((t, idx) => (
                      <span key={idx} style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem' }}>
                        {t.key}: <b style={{ color: '#fff' }}>{t.values.join(' / ')}</b>
                      </span>
                    )) : <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No major discrepancies.</span>}
                  </div>
                </div>
              </div>

              <button className="btn btn-primary glow-active" style={{ marginTop: '40px', width: '100%', height: '50px', fontSize: '1.1rem' }}>
                🚀 Export Case Lead & Close Investigation
              </button>
            </div>
          )}
        </div>

      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default MultiWitnessConsensus;
