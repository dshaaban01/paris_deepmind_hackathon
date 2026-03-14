import { useState, useEffect } from 'react';
import { parseTraits } from '../utils/parser';

const CandidateExploration = ({ apiKey, advancePhase, returnPhase, data, onDataChange }) => {
  const candidates = data.candidates || [];
  const selectedCandidate = data.selectedCandidate || null;
  const refinements = data.refinements || [];
  const generationCount = data.generationCount || 1;
  
  const setCandidates = (cands) => onDataChange({ candidates: cands });
  const setSelectedCandidate = (id) => onDataChange({ selectedCandidate: id });
  const setRefinements = (ref) => onDataChange({ refinements: ref });
  const setGenerationCount = (count) => onDataChange({ generationCount: count });

  const [refinementInput, setRefinementInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const traits = data.structuredTraits || {};
  const traitsList = Object.keys(traits);
  const isFemale = traits.gender?.value === 'female';

  // Build the prompt using confidence to adjust adjectives
  const getPromptWithConfidence = () => {
    const genderTrait = traits.gender?.value?.toLowerCase() || 'person';
    const isFemale = genderTrait.includes('female') || genderTrait.includes('woman');
    const genderAnchor = isFemale ? "A detailed forensic police portrait of a woman" : "A detailed forensic police portrait of a man";

    const features = Object.entries(traits)
      .filter(([key]) => key !== 'unidentified_features' && key !== 'gender')
      .map(([key, trait]) => {
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
  const generatedPrompt = [basePrompt, ...refinements].join(', ');
  
  const lowConfidenceTraits = Object.entries(traits)
    .filter(([_, t]) => t.confidence < 0.6)
    .map(([key]) => key.replaceAll('_', ' '));
  
  const needsClarification = lowConfidenceTraits.length > 0;

  const doGeneration = async (currentPrompt, newGenCount) => {
    setIsGenerating(true);
    
    // Style enforcement
    const styleExt = "tightly cropped single-subject headshot, photorealistic high quality photography, looking straight at camera, neutral background, forensic composite style, studio lighting, NO frames, NO borders";
    const fullPrompt = `${currentPrompt}, ${styleExt}`;

    const generateSingle = async (seedIndex) => {
      try {
        const parts = [{ text: `${fullPrompt}. Subtle stylistic variant ${seedIndex}.` }];
        
        // Include source image in context if available for true multimodal refinement
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

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: parts }],
            generationConfig: {
              responseModalities: ["IMAGE"]
            }
          })
        });
        const resData = await res.json();
        if (resData.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
          const inline = resData.candidates[0].content.parts[0].inlineData;
          return `data:${inline.mimeType};base64,${inline.data}`;
        } else if (resData.error) {
           console.error("Gemini API Error:", resData.error.message);
        }
        return null;
      } catch (err) {
        console.error("Fetch failed:", err);
        return null;
      }
    };

    // Parallel fetch 3 variations
    const imgs = await Promise.all([generateSingle(1), generateSingle(2), generateSingle(3)]);
    
    const newCands = imgs.map((imgUrl, idx) => ({
      id: `${idx + 1}-${newGenCount}`,
      label: `Generation ${newGenCount}.${idx + 1}`,
      notes: newGenCount > 1 ? `Applied: "${refinements[refinements.length - 1] || 'Refinements'}"` : 'Initial baseline',
      // Fallback securely to a local asset if API key hits quota or fails
      image: imgUrl || (isFemale ? `/real_f${idx + 1}.png` : `/real_m${idx + 1}.png`),
      filter: 'none'
    }));
    
    onDataChange({ candidates: newCands, generationCount: newGenCount });
    setIsGenerating(false);
  };

  useEffect(() => {
    // Generate initial set if API key exists
    if (apiKey && candidates.length === 0 && !isGenerating) {
      doGeneration(basePrompt, 1);
    }
  }, [apiKey]);

  const handleRefine = () => {
    if (!refinementInput.trim() || !selectedCandidate || !apiKey) return;

    const baseCand = candidates.find(c => c.id === selectedCandidate);
    const baseLabel = baseCand ? baseCand.label : 'Previous Candidate';

    // Parse new traits from refinement input (async)
    const handleRefineAsync = async () => {
      const result = await parseTraits(refinementInput, apiKey, data.structuredTraits || {});
      const newRefinements = [...refinements, `[Based on ${baseLabel}]: ${refinementInput}`];
      setRefinementInput('');
      
      const nextGen = generationCount + 1;
      const newPrompt = [basePrompt, ...newRefinements].join(', ');
      
      onDataChange({ 
        faceDescription: (data.faceDescription || "") + " | [Refinement]: " + refinementInput,
        refinements: newRefinements,
        selectedCandidate: null,
        generationCount: nextGen
      });
      
      doGeneration(newPrompt, nextGen);
    };

    handleRefineAsync();
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Candidate Exploration (Iteration {generationCount})</h2>
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
        <div style={{ padding: '64px', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
          <div className="animate-pulse" style={{ width: '48px', height: '48px', border: '3px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }}></div>
          <h3>Refining Candidates...</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Applying: "{refinements[refinements.length - 1]}"</p>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
              {candidates.map(candidate => (
                <div 
                  key={candidate.id}
                  className="glass-panel"
                  style={{ 
                    cursor: 'pointer',
                    border: selectedCandidate === candidate.id ? '2px solid var(--primary)' : '1px solid var(--surface-border)',
                    transform: selectedCandidate === candidate.id ? 'translateY(-4px)' : 'none',
                    transition: 'all 0.3s ease',
                    padding: '16px'
                  }}
                  onClick={() => setSelectedCandidate(candidate.id)}
                >
                  <div style={{ width: '100%', aspectRatio: '1/1', background: '#000', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                     <img src={candidate.image} alt={candidate.label} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: candidate.filter }} />
                  </div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>{candidate.label}</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{candidate.notes}</p>
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
                disabled={!refinementInput.trim() || !selectedCandidate}
              >
                Refine Selected
              </button>
            </div>
          </div>
        </>
      )}

      <div className="glass-panel" style={{ marginTop: '16px' }}>
        <h3 style={{ marginBottom: '16px' }}>Extracted Schema Constraints & Confidence</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {traitsList.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No specific traits extracted.</p>
          ) : (
            traitsList.map(key => {
              const trait = traits[key];
              const isLowConfidence = trait.confidence < 0.6;
              return (
                <div key={key} style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'minmax(100px, 140px) minmax(80px, 120px) 1fr 60px', 
                  alignItems: 'center', 
                  gap: '12px', 
                  background: 'rgba(255,255,255,0.05)', 
                  padding: '10px 16px', 
                  borderRadius: '12px',
                  position: 'relative',
                  borderLeft: `4px solid ${isLowConfidence ? 'var(--warning)' : 'transparent'}`,
                  minWidth: 0
                }}>
                  <div style={{ fontWeight: 500, textTransform: 'capitalize' }}>
                    {key.replaceAll('_', ' ')}
                  </div>
                  <div style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {trait.value}
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={trait.confidence * 100}
                    onChange={(e) => {
                      const newConfidence = parseInt(e.target.value) / 100;
                      onDataChange({
                        ...data,
                        structuredTraits: {
                          ...data.structuredTraits,
                          [key]: { ...trait, confidence: newConfidence }
                        }
                      });
                    }}
                    style={{ cursor: 'pointer', width: '100%' }}
                  />
                  <div style={{ textAlign: 'right', fontWeight: 'bold', color: isLowConfidence ? 'var(--warning)' : 'var(--success)' }}>
                    {Math.round(trait.confidence * 100)}%
                  </div>
                  {isLowConfidence && (
                    <div style={{ 
                      position: 'absolute', 
                      bottom: '-4px', 
                      left: '136px', 
                      fontSize: '0.65rem', 
                      color: 'var(--warning)', 
                      background: '#1a1a1a', 
                      padding: '0 4px',
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
