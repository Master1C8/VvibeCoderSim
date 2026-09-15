import { ImageResponse } from 'next/og';
import { formatSpentTokens, parseVictoryShareParams } from '@/lib/game/session';

export const runtime = 'nodejs';

export const GET = (request: Request) => {
  const result = parseVictoryShareParams(new URL(request.url).searchParams);
  const visibleNames = result.programmerNames.slice(0, 5);
  const remainingNames = result.programmerNames.length - visibleNames.length;
  const stats = [
    ['Total tokens', formatSpentTokens(result.totalTokensSpent)],
    ['Final coder', formatSpentTokens(result.currentProgrammerTokensSpent || 0)],
    ['Context', formatSpentTokens(result.contextTokens || 0)],
    ['Failures', String(result.failedDeployments)],
  ];

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', padding: 50, background: '#f0fbf6', color: '#053b2f', fontFamily: 'sans-serif' }}>
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', border: '2px solid #a7f3d0', borderRadius: 28, background: '#ecfdf5', padding: '38px 44px' }}>
          <div style={{ display: 'flex', color: '#059669', fontSize: 18, fontWeight: 700, letterSpacing: 2 }}>VVIBECODER SIM · PRODUCTION</div>
          <div style={{ display: 'flex', marginTop: 14, fontSize: 40, lineHeight: 1.1, fontWeight: 800 }}>Congratulations! The deploy outlived everyone</div>
          <div style={{ display: 'flex', marginTop: 18, fontSize: 25, lineHeight: 1.35, color: '#047857' }}>
            Project “{result.projectName}” made it to production. The infrastructure chose not to object.
          </div>

          <div style={{ display: 'flex', marginTop: 28, fontSize: 17, fontWeight: 800, color: '#047857', textTransform: 'uppercase', letterSpacing: 1.4 }}>
            Coders who worked on it · {result.programmerNames.length}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 12 }}>
            {visibleNames.map((name, index) => (
              <div key={`${name}-${index}`} style={{ display: 'flex', border: '2px solid #a7f3d0', borderRadius: 9, background: '#ffffff', padding: '8px 14px', fontSize: 18, fontWeight: 600 }}>
                {index + 1}. {name}
              </div>
            ))}
            {remainingNames > 0 && (
              <div style={{ display: 'flex', border: '2px solid #a7f3d0', borderRadius: 9, background: '#ffffff', padding: '8px 14px', fontSize: 18, fontWeight: 600 }}>
                +{remainingNames}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 'auto' }}>
            {stats.map(([label, value]) => (
              <div key={label} style={{ display: 'flex', flex: 1, flexDirection: 'column', border: '2px solid #d1fae5', borderRadius: 14, background: '#ffffff', padding: '16px 18px' }}>
                <div style={{ display: 'flex', fontSize: 16, color: '#047857' }}>{label}</div>
                <div style={{ display: 'flex', marginTop: 6, fontSize: 28, fontWeight: 800 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
};
