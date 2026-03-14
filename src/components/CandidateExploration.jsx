import { useState, useEffect } from 'react';

const initialGenerationLocks = new Set();
const CONFIDENCE_LEVELS = {
  low: { label: 'Not so confident', value: 0.45 },
  mid: { label: 'Middle', value: 0.75 },
  high: { label: 'Very confident', value: 0.92 }
};

const CandidateExploration = ({ apiKey, advancePhase, returnPhase, data, onDataChange }) => {
  const candidates = data.candidates || [];
  const selectedCandidate = data.selectedCandidate || null;
  const refinements = data.refinements || [];
  const generationCount = data.generationCount || 1;

  const setSelectedCandidate = (id) => onDataChange({ selectedCandidate: id });

  const [refinementInput, setRefinementInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFallbackActive, setIsFallbackActive] = useState(false);
  const [confidenceSelections, setConfidenceSelections] = useState({});

  const traits = data.structuredTraits || {};
  const traitsList = Object.keys(traits);
  const isFemale = traits.gender?.value === 'female';

  // Build the prompt using confidence to adjust adjectives
  const getPromptWithConfidence = () => {
    const genderTrait = traits.gender?.value?.toLowerCase() || 'person';
    const isFemale = genderTrait.includes('female') || genderTrait.includes('woman');
    const genderAnchor = isFemale ? "A passport-style identification portrait of a woman" : "A passport-style identification portrait of a man";

    const features = Object.entries(traits)
      .filter(([key]) => key !== 'unidentified_features' && key !== 'gender')
      .map(([, trait]) => {
        const val = trait.value;
        const conf = trait.confidence;
        if (conf >= 0.9) return `very prominent ${val}`;
        if (conf >= 0.75) return `distinctive ${val}`;
        if (conf < 0.6) return `subtle or vague ${val}`;
        return val;
      })
      .join(', ');

    return `${genderAnchor}, ${features}`;
  };

  const basePrompt = getPromptWithConfidence();

  const lowConfidenceTraits = Object.entries(traits)
    .filter(([, t]) => t.confidence < 0.6)
    .map(([key]) => key.replaceAll('_', ' '));

  const needsClarification = lowConfidenceTraits.length > 0;
  const hasPendingConfidenceSelection = Object.values(confidenceSelections).some(Boolean);

  const getConfidenceLevel = (confidence) => {
    if (confidence >= 0.9) return 'high';
    if (confidence >= 0.6) return 'mid';
    return 'low';
  };

  const applyConfidenceSelections = (baseTraits) => {
    let hasSelection = false;
    const updatedTraits = { ...baseTraits };
    const summary = [];

    Object.entries(confidenceSelections).forEach(([key, level]) => {
      if (!level || !updatedTraits[key]) return;
      hasSelection = true;
      updatedTraits[key] = {
        ...updatedTraits[key],
        confidence: CONFIDENCE_LEVELS[level].value
      };
      summary.push(`${key.replaceAll('_', ' ')}: ${CONFIDENCE_LEVELS[level].label}`);
    });

    return { updatedTraits, hasSelection, summary };
  };

  const doGeneration = async (currentPrompt, newGenCount, options = {}) => {
    const { lockKey } = options;
    setIsGenerating(true);
    setIsFallbackActive(false);
    try {
      // Style enforcement
      const styleExt = "single-subject passport photo style, face centered and straight to camera, head and upper shoulders visible, neutral plain background, balanced framing, photorealistic high quality, consistent lighting, no dramatic shadows, NO text, NO numbers, NO logos, NO watermark, NO frames, NO borders";
      const fullPrompt = `${currentPrompt}, ${styleExt}`;

      const generateSingle = async (seedIndex) => {
        try {
          const entropy = Math.random().toString(36).substring(7);
          const parts = [{ text: `${fullPrompt}. Unique Variant ID: ${entropy}. Subtle artistic shift ${seedIndex}.` }];

          if (data.sourceImage) {
            const [header, base64Data] = data.sourceImage.split(',');
            const mimeType = header.split(':')[1].split(';')[0];
            parts.push({
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            });
          }

          const seed = Math.floor(Math.random() * 1000000);
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: parts }],
              generationConfig: {
                responseModalities: ["IMAGE"],
                seed: seed
              }
            })
          });
          if (!res.ok) {
            return { image: null, issue: true };
          }
          const resData = await res.json();
          if (resData.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
            const inline = resData.candidates[0].content.parts[0].inlineData;
            return { image: `data:${inline.mimeType};base64,${inline.data}`, issue: false };
          } else if (resData.error) {
            console.error("Gemini API Error:", resData.error.message);
            return { image: null, issue: true };
          }
          return { image: null, issue: false };
        } catch (err) {
          console.error("Fetch failed:", err);
          return { image: null, issue: true };
        }
      };

      const generationResults = await Promise.all([generateSingle(1), generateSingle(2), generateSingle(3)]);
      const imgs = generationResults.map(result => result.image);
      const allFallback = imgs.every(img => img === null);
      const hasRealApiIssue = generationResults.some(result => result.issue);
      setIsFallbackActive(allFallback && hasRealApiIssue);

      const newCands = imgs.map((imgUrl, idx) => ({
        id: `${idx + 1}-${newGenCount}`,
        label: `Generation ${newGenCount}.${idx + 1}`,
        notes: newGenCount > 1 ? `Applied: "${refinements[refinements.length - 1] || 'Refinements'}"` : 'Initial baseline',
        image: imgUrl || (isFemale ? `https://i.pravatar.cc/300?u=fallback-f${idx}-${newGenCount}` : `https://i.pravatar.cc/300?u=fallback-m${idx}-${newGenCount}`),
        filter: 'none'
      }));

      onDataChange({ candidates: newCands, generationCount: newGenCount });
    } finally {
      if (lockKey) {
        initialGenerationLocks.delete(lockKey);
      }
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (!apiKey || candidates.length > 0 || isGenerating) return;

    const lockKey = `${data.id || 'witness'}-initial`;
    if (initialGenerationLocks.has(lockKey)) return;

    initialGenerationLocks.add(lockKey);
    doGeneration(basePrompt, 1, { lockKey });
  }, [apiKey, candidates.length, isGenerating, basePrompt, data.id]);

  const handleRefine = () => {
    if (!selectedCandidate || !apiKey) return;

    const typedRefinement = refinementInput.trim();
    const { updatedTraits, hasSelection, summary } = applyConfidenceSelections(data.structuredTraits || {});
    if (!typedRefinement && !hasSelection) return;

    const baseCand = candidates.find(c => c.id === selectedCandidate);
    const baseLabel = baseCand ? baseCand.label : 'Previous Candidate';

    const refinementSegments = [];
    if (typedRefinement) {
      refinementSegments.push(`[Based on ${baseLabel}]: ${typedRefinement}`);
    }
    if (hasSelection) {
      refinementSegments.push(`[Confidence update]: ${summary.join(', ')}`);
    }

    const refinementNote = refinementSegments.join(' | ');
    const newRefinements = [...refinements, refinementNote];
    const nextGen = generationCount + 1;
    const adjustedBasePrompt = getPromptWithConfidence(updatedTraits);
    const newPrompt = [adjustedBasePrompt, ...newRefinements].join(', ');

    setRefinementInput('');
    setConfidenceSelections({});

    onDataChange({
      faceDescription: typedRefinement
        ? (data.faceDescription || "") + " | [Refinement]: " + typedRefinement
        : (data.faceDescription || ""),
      structuredTraits: updatedTraits,
      refinements: newRefinements,
      selectedCandidate: null,
      generationCount: nextGen
    });

    doGeneration(newPrompt, nextGen);
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ margin: 0 }}>Candidate Exploration (Iteration {generationCount})</h2>
            {isFallbackActive && (
              <span style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
                ⚠️ API OFFLINE / FALLBACK ACTIVE
              </span>
            )}
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>Select the closest match or refine features.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn" onClick={returnPhase}>← Refine Description</button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', minHeight: '64px' }}>
          <button
            className="btn btn-primary"
            onClick={advancePhase}
            disabled={!selectedCandidate || needsClarification}
            style={{
              opacity: (selectedCandidate && !needsClarification) ? 1 : 0.5,
              minWidth: '180px',
              height: '40px'
            }}
          >
            {needsClarification ? '🔒 Locked' : 'Confirm Match →'}
          </button>
          {needsClarification && (
            <span style={{ fontSize: '0.7rem', color: 'var(--warning)', maxWidth: '200px', textAlign: 'right', animation: 'fade-in 0.3s ease' }}>
              Clarification: <b>{lowConfidenceTraits[0]}</b>
            </span>
          )}
        </div>
        </div>
      </div>

      {isGenerating ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px' }}>
            {[1, 2, 3].map((slot) => (
              <div
                key={slot}
                className="glass-panel"
                style={{
                  padding: '20px',
                  border: '1px solid var(--surface-border)'
                }}
              >
                <div style={{ width: '100%', aspectRatio: '1/1', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', marginBottom: '16px', animation: 'pulse-glow 1.5s ease-in-out infinite' }} />
                <div style={{ height: '18px', width: '55%', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', marginBottom: '10px' }} />
                <div style={{ height: '12px', width: '85%', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', marginBottom: '6px' }} />
                <div style={{ height: '12px', width: '70%', borderRadius: '8px', background: 'rgba(255,255,255,0.05)' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-blue)', animation: 'pulse-glow 1.2s ease-in-out infinite' }} />
            Generating candidate portraits...
          </div>
        </div>
      ) : (
        <>
          {/* Candidates Grid */}
          {!apiKey ? (
            <div style={{ padding: '64px', textAlign: 'center', background: 'rgba(255,100,100,0.1)', borderRadius: '12px', border: '1px solid var(--warning)' }}>
              <h3>Missing API Key</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Please enter your Gemini API Key in the top navigation bar to enable "Nano Banana" image generation.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px' }}>
              {candidates.map(candidate => (
                <div
                  key={candidate.id}
                  className="glass-panel hover-card"
                  style={{
                    cursor: 'pointer',
                    border: selectedCandidate === candidate.id ? '2px solid var(--accent-blue)' : '1px solid var(--surface-border)',
                    background: selectedCandidate === candidate.id ? 'rgba(59, 130, 246, 0.1)' : 'var(--surface-color)',
                    padding: '20px'
                  }}
                  onClick={() => setSelectedCandidate(candidate.id)}
                >
                  <div style={{ width: '100%', aspectRatio: '1/1', background: '#000', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px', boxShadow: '0 8px 16px rgba(0,0,0,0.3)' }}>
                     <img src={candidate.image} alt={candidate.label} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: candidate.filter }} />
                  </div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', color: '#fff' }}>{candidate.label}</h3>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>{candidate.notes}</p>
                </div>
              ))}
            </div>
          )}

          {/* Refinement Input Box */}
          <div className="glass-panel" style={{ padding: '16px', marginTop: '16px' }}>
            {needsClarification ? (
              <p style={{ color: 'var(--warning)', fontSize: '0.9rem', marginBottom: '8px', textAlign: 'center' }}>
                ⚠️ Please provide more details about the <b>{lowConfidenceTraits[0]}</b> to increase certainty before confirming.
              </p>
            ) : !selectedCandidate ? (
              <p style={{ color: 'var(--warning)', fontSize: '0.9rem', marginBottom: '8px', textAlign: 'center' }}>
                Select a candidate above to refine it locally
              </p>
            ) : (
              <p style={{ color: 'var(--success)', fontSize: '0.9rem', marginBottom: '8px', textAlign: 'center' }}>
                Refining Candidate {candidates.find(c => c.id === selectedCandidate)?.label}
              </p>
            )}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <input
                type="text"
                className="input-field"
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'rgba(0,0,0,0.2)', color: 'white', opacity: selectedCandidate ? 1 : 0.5 }}
                placeholder="e.g., 'Make the eyes closer together', 'Straighter hair', 'Lighter skin tone'"
                value={refinementInput}
                onChange={(e) => setRefinementInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                disabled={!selectedCandidate}
              />
              <button
                className="btn btn-primary"
                onClick={handleRefine}
                disabled={(!refinementInput.trim() && !hasPendingConfidenceSelection) || !selectedCandidate}
              >
                Refine Selected
              </button>
            </div>
          </div>
        </>
      )}

      <div className="glass-panel" style={{ marginTop: '16px', padding: '20px', minHeight: '420px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginBottom: '16px' }}>Extracted Schema Constraints & Confidence</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1, minHeight: 0, paddingRight: '8px' }}>
          {traitsList.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No specific traits extracted.</p>
          ) : (
            traitsList.map(key => {
              const trait = traits[key];
              const isLowConfidence = trait.confidence < 0.6;
              return (
                <div key={key} style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(110px, 170px) minmax(120px, 1fr) minmax(170px, 220px) minmax(120px, 160px)',
                  alignItems: 'center',
                  gap: '12px',
                  background: 'rgba(255,255,255,0.05)',
                  padding: '10px 16px',
                  borderRadius: '12px',
                  borderLeft: `4px solid ${isLowConfidence ? 'var(--warning)' : 'transparent'}`,
                  minWidth: 0
                }}>
                  <div style={{ fontWeight: 500, textTransform: 'capitalize', wordBreak: 'break-word' }}>
                    {key.replaceAll('_', ' ')}
                  </div>
                  <div style={{ color: 'var(--text-primary)', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                    {trait.value}
                  </div>
                  <select
                    value={confidenceSelections[key] || ''}
                    onChange={(e) => {
                      const newLevel = e.target.value;
                      setConfidenceSelections(prev => ({
                        ...prev,
                        [key]: newLevel
                      }));
                    }}
                    style={{
                      cursor: 'pointer',
                      width: '100%',
                      background: 'rgba(0,0,0,0.25)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--surface-border)',
                      borderRadius: '8px',
                      padding: '8px 10px'
                    }}
                  >
                    <option value="">Optional: keep current</option>
                    <option value="low">Not so confident</option>
                    <option value="mid">Middle</option>
                    <option value="high">Very confident</option>
                  </select>
                  <div style={{ textAlign: 'right', fontWeight: 'bold', color: isLowConfidence ? 'var(--warning)' : 'var(--success)' }}>
                    {CONFIDENCE_LEVELS[getConfidenceLevel(trait.confidence)].label}
                  </div>
                  {isLowConfidence && (
                    <div style={{
                      gridColumn: '2 / -1',
                      fontSize: '0.72rem',
                      color: 'var(--warning)',
                      background: 'rgba(245, 158, 11, 0.12)',
                      padding: '4px 8px',
                      marginTop: '-2px',
                      borderRadius: '4px'
                    }}>
                      Clarification suggested
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default CandidateExploration;
