# Firebase — versão SEM Storage (só Auth + Firestore)

## O que você precisa

1. **Authentication** (e-mail/senha + usuário admin)
2. **Firestore Database** (clientes e galerias)
3. **NÃO precisa** de Storage

## Único arquivo para editar no site

```
assets/js/firebase-config.js
```

Cole o `firebaseConfig` do Console → ⚙️ → Seus apps.

## Regras do Firestore

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /galerias/{id} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /clientes/{id} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Fotos

Cole a **URL direta** da imagem (https://...).

Onde hospedar as fotos (grátis / barato), por exemplo:
- Seu próprio servidor / hospedagem
- Cloudinary (plano free)
- ImageKit
- Link público de um host que sirva o arquivo original

O download do cliente usa a mesma URL (qualidade = a do arquivo hospedado).
