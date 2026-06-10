export const TypingIndicator = () => (
  <div className="animate-slide-up" style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '24px' }}>
    {/* Avatar — matches AiAvatar in ChatMessage */}
    <div style={{ flexShrink: 0, marginRight: '14px', marginTop: '1px' }}>
      <div style={{
        width: '30px', height: '30px', borderRadius: '50%',
        background: 'linear-gradient(135deg, hsl(250 85% 50%), hsl(215 85% 54%))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 8px hsl(250 85% 50% / 0.3)',
      }}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="2.5" fill="white" opacity="0.95" />
          <circle cx="8" cy="8" r="5.5" stroke="white" strokeWidth="1" opacity="0.4" />
        </svg>
      </div>
    </div>

    {/* Dots */}
    <div style={{
      padding: '12px 16px', borderRadius: '12px',
      display: 'flex', alignItems: 'center', gap: '5px',
      marginTop: '5px',
    }}>
      {[0, 160, 320].map(delay => (
        <span
          key={delay}
          className="animate-dot-pulse"
          style={{
            display: 'inline-block', width: '7px', height: '7px',
            borderRadius: '50%', animationDelay: `${delay}ms`,
            background: 'hsl(250 50% 52%)',
          }}
        />
      ))}
    </div>
  </div>
);
