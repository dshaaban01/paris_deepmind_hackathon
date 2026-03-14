import { useState } from 'react';
import WitnessInterview from './components/WitnessInterview';
import CandidateExploration from './components/CandidateExploration';
import MultiWitnessConsensus from './components/MultiWitnessConsensus';

function App() {
  const [currentPhase, setCurrentPhase] = useState('interview'); // interview, candidates, consensus
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '');
  const [activeWitnessId, setActiveWitnessId] = useState('A');
  
  const initialWitness = (id) => ({
    id,
    name: `Witness ${id}`,
    faceDescription: "",
    structuredTraits: {},
    messages: [
      { id: 1, text: `I'm ShareLock, the AI sketch artist. Witness ${id}, can you describe the person you saw?`, sender: "ai" }
    ],
    candidates: [],
    selectedCandidate: null,
    sourceImage: null,
    refinements: [],
    generationCount: 1
  });

  const [witnesses, setWitnesses] = useState([initialWitness('A'), initialWitness('B')]);

  const activeWitness = witnesses.find(w => w.id === activeWitnessId);

  const updateWitness = (id, newData) => {
    setWitnesses(prev => prev.map(w => w.id === id ? { ...w, ...newData } : w));
  };

  const addWitness = () => {
    const nextLabel = String.fromCharCode(65 + witnesses.length); // A, B, C...
    const newW = initialWitness(nextLabel);
    setWitnesses(prev => [...prev, newW]);
    setActiveWitnessId(nextLabel);
    setCurrentPhase('interview');
  };

  const handleKeyChange = (e) => {
    const val = e.target.value;
    setApiKey(val);
    localStorage.setItem('gemini_api_key', val);
  };

  return (
    <div className="app-container">
      <header className="glass-header">
        <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1400px', margin: '0 auto' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '32px', height: '32px', background: 'var(--accent-gradient)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>S</div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', letterSpacing: '0.1em' }}>SHARELOCK</h3>
          </div>

          {/* Phase indicator */}
          <div style={{ display: 'flex', gap: '32px', fontSize: '0.9rem', color: 'var(--text-secondary)', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '6px', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
              {witnesses.map(w => (
                <button 
                  key={w.id}
                  onClick={() => {
                    setActiveWitnessId(w.id);
                    if (currentPhase === 'candidates' || currentPhase === 'consensus') {
                      setCurrentPhase('interview');
                    }
                  }}
                  className={activeWitnessId === w.id ? 'glow-active' : ''}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: activeWitnessId === w.id ? 'var(--accent-gradient)' : 'transparent',
                    color: activeWitnessId === w.id ? 'white' : 'var(--text-secondary)',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {w.name} {w.selectedCandidate ? '✨' : ''}
                </button>
              ))}
              <button 
                onClick={addWitness}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  border: '1px dashed var(--surface-border)',
                  background: 'rgba(255,255,255,0.02)',
                  color: 'var(--text-secondary)',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s ease'
                }}
                className="btn-hover-cute"
                title="Add Witness"
              >
                +
              </button>
            </div>

            <div style={{ width: '1px', height: '24px', background: 'var(--surface-border)' }}></div>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <span style={{ 
                color: currentPhase === 'interview' ? 'var(--accent-blue)' : 'inherit', 
                fontWeight: '700',
                opacity: currentPhase === 'interview' ? 1 : 0.5
              }}>1. Interview</span>
              <span style={{ opacity: 0.3 }}>→</span>
              <span style={{ 
                color: currentPhase === 'candidates' ? 'var(--accent-blue)' : 'inherit', 
                fontWeight: '700',
                opacity: currentPhase === 'candidates' ? 1 : 0.5
              }}>2. Refinement</span>
              <span style={{ opacity: 0.3 }}>→</span>
              <span style={{ 
                color: currentPhase === 'consensus' ? 'var(--accent-blue)' : 'inherit', 
                fontWeight: '700',
                opacity: currentPhase === 'consensus' ? 1 : 0.5
              }}>3. Consensus</span>
            </div>
          </div>

          <div style={{ width: '150px' }}></div> {/* Spacer for symmetry */}
        </div>
      </header>
      
      <main style={{ padding: '100px 32px 32px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        {currentPhase === 'interview' && (
          <WitnessInterview 
            key={activeWitnessId}
            apiKey={apiKey}
            advancePhase={() => setCurrentPhase('candidates')} 
            onDataChange={(newData) => updateWitness(activeWitnessId, newData)} 
            data={activeWitness} 
          />
        )}
        {currentPhase === 'candidates' && (
          <CandidateExploration 
            key={activeWitnessId}
            apiKey={apiKey} 
            advancePhase={() => setCurrentPhase('consensus')} 
            returnPhase={() => setCurrentPhase('interview')} 
            data={activeWitness} 
            onDataChange={(newData) => updateWitness(activeWitnessId, newData)} 
          />
        )}
        {currentPhase === 'consensus' && (
          <MultiWitnessConsensus 
            witnesses={witnesses}
            apiKey={apiKey}
            returnPhase={() => setCurrentPhase('candidates')} 
          />
        )}
      </main>
    </div>
  );
}

export default App;
