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
      { id: 1, text: `I'm Gemini, the AI sketch artist. Witness ${id}, can you describe the person you saw?`, sender: "ai" }
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
        <div style={{ padding: '12px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {/* Phase indicator */}
          <div style={{ display: 'flex', gap: '24px', fontSize: '0.9rem', color: 'var(--text-secondary)', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
              {witnesses.map(w => (
                <button 
                  key={w.id}
                  onClick={() => {
                    setActiveWitnessId(w.id);
                    if (currentPhase === 'candidates' || currentPhase === 'consensus') {
                      setCurrentPhase('interview');
                    }
                  }}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeWitnessId === w.id ? 'white' : 'transparent',
                    color: activeWitnessId === w.id ? 'black' : 'var(--text-secondary)',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                >
                  {w.name} {w.selectedCandidate ? '✅' : ''}
                </button>
              ))}
              <button 
                onClick={addWitness}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px dashed var(--surface-border)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--text-secondary)',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s ease'
                }}
                title="Add Witness"
              >
                +
              </button>
            </div>

            <div style={{ width: '1px', height: '24px', background: 'var(--surface-border)' }}></div>

            <span style={{ color: currentPhase === 'interview' ? 'white' : 'inherit', fontWeight: currentPhase === 'interview' ? 'bold' : 'normal' }}>1. Interview</span>
            <span>→</span>
            <span style={{ color: currentPhase === 'candidates' ? 'white' : 'inherit', fontWeight: currentPhase === 'candidates' ? 'bold' : 'normal' }}>2. Refinement</span>
            <span>→</span>
            <span style={{ color: currentPhase === 'consensus' ? 'white' : 'inherit', fontWeight: currentPhase === 'consensus' ? 'bold' : 'normal' }}>3. Consensus</span>
          </div>
        </div>
      </header>
      
      <main style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
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
