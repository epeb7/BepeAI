import { useState } from 'react';
import { Button } from './ui/button';

export const LogoUpload = () => {
  const [logoPreview, setLogoPreview] = useState<string | null>(localStorage.getItem('logoBase64') || null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        localStorage.setItem('logoBase64', base64);
        setLogoPreview(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex items-center gap-4 p-2 border rounded">
      {logoPreview && <img src={logoPreview} alt="Logo" className="h-8 w-auto" />}
      <input type="file" accept="image/png,image/jpeg" onChange={handleUpload} />
      <Button variant="ghost" size="sm" onClick={() => {
        localStorage.removeItem('logoBase64');
        setLogoPreview(null);
      }}>Remover</Button>
    </div>
  );
};