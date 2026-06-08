import type { ProgressInfo } from '../../services/groq.service';

interface ProgressBarProps { progress: ProgressInfo; }

export function ProgressBar({ progress }: ProgressBarProps) {
  const { currentGroup, totalGroups, currentGroupLabel, completedFields, totalFields, isComplete } = progress;
  const pct = isComplete ? 100 : totalGroups > 0 ? Math.round((currentGroup / totalGroups) * 100) : 0;

  return (
    <div style={{
      flexShrink: 0, padding: '8px 20px',
      background: 'hsl(220 18% 10%)',
      borderBottom: '1px solid hsl(220 14% 16%)',
    }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Pulsing dot when active */}
            {!isComplete && (
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                background: 'hsl(250 85% 64%)',
                boxShadow: '0 0 6px hsl(250 85% 60% / 0.7)',
                animation: 'brandPing 1.8s cubic-bezier(0,0,0.2,1) infinite',
              }} />
            )}
            <span style={{
              fontSize: '11px', fontWeight: 500,
              color: isComplete ? 'hsl(150 55% 52%)' : 'hsl(250 50% 72%)',
            }}>
              {isComplete ? '✓ Coleta concluída' : currentGroupLabel}
            </span>
          </div>
          <span style={{ fontSize: '10px', color: 'hsl(215 8% 36%)' }}>
            {completedFields}/{totalFields} campos · {Math.min(currentGroup + 1, totalGroups)}/{totalGroups}
          </span>
        </div>

        {/* Track */}
        <div style={{
          height: '2px', borderRadius: '99px', overflow: 'hidden',
          background: 'hsl(220 14% 20%)',
        }}>
          <div style={{
            height: '100%', borderRadius: '99px',
            width: `${pct}%`,
            background: isComplete
              ? 'hsl(150 55% 48%)'
              : 'linear-gradient(90deg, hsl(250 85% 60%), hsl(215 85% 60%))',
            transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: isComplete ? 'none' : '0 0 8px hsl(250 85% 60% / 0.4)',
          }} />
        </div>
      </div>
    </div>
  );
}
