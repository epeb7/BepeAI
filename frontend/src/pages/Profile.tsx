import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Trash2, Save, Building2, Palette, User } from 'lucide-react';
import { userService, UserProfile } from '../services/user.service';

export function Profile() {
  const navigate = useNavigate();

  const [profile, setProfile]         = useState<UserProfile | null>(null);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');

  const [companyName, setCompanyName] = useState('');
  const [brandColor, setBrandColor]   = useState('#5B3DF5');

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    userService.getProfile()
      .then(p => {
        setProfile(p);
        setCompanyName(p.company_name ?? '');
        setBrandColor(p.brand_color ?? '#5B3DF5');
      })
      .catch(() => setError('Erro ao carregar perfil'))
      .finally(() => setLoading(false));
  }, []);

  const flash = (msg: string, type: 'success' | 'error') => {
    if (type === 'success') { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); }
    else { setError(msg); setTimeout(() => setError(''), 4000); }
  };

  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) { flash('Apenas imagens PNG ou JPG são aceitas.', 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { flash('Imagem muito grande. Máximo 2MB.', 'error'); return; }

    setUploadingLogo(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await userService.uploadLogo(base64);
      setProfile(p => p ? { ...p, logo_base64: base64 } : p);
      flash('Logo atualizada com sucesso!', 'success');
    } catch {
      flash('Erro ao fazer upload da logo.', 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    setUploadingLogo(true);
    try {
      await userService.removeLogo();
      setProfile(p => p ? { ...p, logo_base64: null } : p);
      flash('Logo removida.', 'success');
    } catch {
      flash('Erro ao remover logo.', 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await userService.updateSettings({ companyName: companyName || undefined, brandColor });
      setProfile(p => p ? { ...p, company_name: companyName || null, brand_color: brandColor } : p);
      flash('Configurações salvas!', 'success');
    } catch {
      flash('Erro ao salvar configurações.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{`
        .profile-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1.5px solid hsl(220 14% 21%);
          background: hsl(218 20% 10%);
          color: hsl(215 18% 86%);
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .profile-input:focus {
          border-color: hsl(250 85% 58%);
          box-shadow: 0 0 0 3px hsl(250 85% 60% / 0.12);
        }
        .profile-section {
          background: hsl(220 18% 11%);
          border: 1px solid hsl(220 14% 17%);
          border-radius: 16px;
          padding: 20px 22px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .profile-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: hsl(215 16% 72%);
          letter-spacing: 0.02em;
          text-transform: uppercase;
          margin: 0;
        }
        .logo-drop-area {
          border: 1.5px dashed hsl(220 14% 26%);
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          cursor: pointer;
          transition: all 0.18s;
          background: hsl(218 20% 9%);
        }
        .logo-drop-area:hover {
          border-color: hsl(250 60% 48%);
          background: hsl(250 40% 12% / 0.4);
        }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: 'hsl(218 20% 8%)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '0 20px', height: '52px', flexShrink: 0,
          background: 'hsl(218 20% 8%)',
          borderBottom: '1px solid hsl(220 14% 13%)',
        }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'transparent', border: 'none',
              color: 'hsl(215 10% 44%)', fontSize: '13px', cursor: 'pointer',
              padding: '6px 10px', borderRadius: '8px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'hsl(220 14% 16%)'; e.currentTarget.style.color = 'hsl(215 12% 66%)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'hsl(215 10% 44%)'; }}
          >
            <ArrowLeft size={15} />
            Voltar
          </button>
          <div style={{ width: '1px', height: '18px', background: 'hsl(220 14% 18%)' }} />
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'hsl(215 16% 78%)' }}>
            Meu Perfil
          </span>
        </header>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 20px' }}>
          <div style={{ maxWidth: '520px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'hsl(215 10% 40%)' }}>
                Carregando…
              </div>
            ) : (
              <>
                {/* Toast */}
                {(success || error) && (
                  <div style={{
                    padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 500,
                    background: success ? 'hsl(150 55% 12% / 0.6)' : 'hsl(0 55% 14% / 0.6)',
                    border: `1px solid ${success ? 'hsl(150 55% 28%)' : 'hsl(0 55% 28%)'}`,
                    color: success ? 'hsl(150 60% 58%)' : 'hsl(0 68% 60%)',
                  }}>
                    {success || error}
                  </div>
                )}

                {/* Seção: Conta */}
                <div className="profile-section">
                  <p className="profile-section-title"><User size={13} /> Conta</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px 12px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'hsl(215 10% 42%)' }}>Nome</span>
                    <span style={{ fontSize: '13px', color: 'hsl(215 14% 74%)' }}>{profile?.name ?? '—'}</span>
                    <span style={{ fontSize: '12px', color: 'hsl(215 10% 42%)' }}>E-mail</span>
                    <span style={{ fontSize: '13px', color: 'hsl(215 14% 74%)' }}>{profile?.email ?? '—'}</span>
                    <span style={{ fontSize: '12px', color: 'hsl(215 10% 42%)' }}>Perfil</span>
                    <span style={{
                      fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em',
                      color: profile?.role === 'admin' ? 'hsl(250 70% 68%)' : 'hsl(150 55% 52%)',
                      textTransform: 'uppercase',
                    }}>
                      {profile?.role === 'admin' ? 'Administrador' : 'Usuário'}
                    </span>
                  </div>
                </div>

                {/* Seção: Logo da Empresa */}
                <div className="profile-section">
                  <p className="profile-section-title"><Building2 size={13} /> Logo da empresa</p>
                  <p style={{ margin: 0, fontSize: '12px', color: 'hsl(215 10% 42%)', lineHeight: 1.6 }}>
                    Sua logo aparece no cabeçalho de todos os documentos PDF gerados.
                    Formatos aceitos: PNG ou JPG, máximo 2MB.
                  </p>

                  {profile?.logo_base64 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{
                        flex: 1, padding: '14px 18px', borderRadius: '10px',
                        background: 'hsl(218 20% 9%)', border: '1px solid hsl(220 14% 20%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        minHeight: '70px',
                      }}>
                        <img
                          src={profile.logo_base64}
                          alt="Logo"
                          style={{ maxHeight: '50px', maxWidth: '200px', objectFit: 'contain' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <button
                          onClick={() => fileRef.current?.click()}
                          disabled={uploadingLogo}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px', borderRadius: '9px', fontSize: '12px', fontWeight: 500,
                            border: '1.5px solid hsl(220 14% 24%)',
                            background: 'hsl(220 18% 14%)',
                            color: 'hsl(215 10% 62%)', cursor: 'pointer',
                          }}
                        >
                          <Upload size={12} /> Trocar
                        </button>
                        <button
                          onClick={handleRemoveLogo}
                          disabled={uploadingLogo}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px', borderRadius: '9px', fontSize: '12px', fontWeight: 500,
                            border: '1.5px solid hsl(0 40% 28%)',
                            background: 'hsl(0 30% 12%)',
                            color: 'hsl(0 60% 58%)', cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={12} /> Remover
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="logo-drop-area"
                      onClick={() => fileRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file) handleLogoUpload(file);
                      }}
                    >
                      {uploadingLogo ? (
                        <span style={{ fontSize: '13px', color: 'hsl(215 10% 44%)' }}>Enviando…</span>
                      ) : (
                        <>
                          <Upload size={20} style={{ color: 'hsl(215 10% 36%)', marginBottom: '8px' }} />
                          <p style={{ margin: 0, fontSize: '13px', color: 'hsl(215 10% 44%)' }}>
                            Clique ou arraste a logo aqui
                          </p>
                          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'hsl(215 10% 32%)' }}>
                            PNG ou JPG — máx. 2MB
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoUpload(file);
                      e.target.value = '';
                    }}
                  />
                </div>

                {/* Seção: Personalização */}
                <div className="profile-section">
                  <p className="profile-section-title"><Palette size={13} /> Personalização</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', color: 'hsl(215 10% 46%)' }}>Nome da empresa</label>
                    <input
                      className="profile-input"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="Ex: Leticia Abreu Recrutamento e Seleção"
                      maxLength={100}
                    />
                    <span style={{ fontSize: '11px', color: 'hsl(215 10% 34%)' }}>
                      Aparece no cabeçalho do PDF quando não há logo configurada.
                    </span>
                  </div>

                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                      padding: '11px 0', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                      border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                      background: saving
                        ? 'hsl(250 40% 30%)'
                        : 'linear-gradient(135deg, hsl(250 85% 52%), hsl(215 85% 54%))',
                      color: '#fff', opacity: saving ? 0.7 : 1,
                      transition: 'opacity 0.15s',
                      boxShadow: saving ? 'none' : '0 4px 16px hsl(250 85% 50% / 0.22)',
                    }}
                  >
                    <Save size={14} />
                    {saving ? 'Salvando…' : 'Salvar configurações'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default Profile;
