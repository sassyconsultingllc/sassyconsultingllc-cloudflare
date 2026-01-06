# Contact Form Handler

Modular Rust contact form handler with validation and email sending.

## Features

- Framework-agnostic design
- Form validation via `validator` crate
- Async email sending via `lettre`
- Environment-based configuration

## Environment Variables

```bash
SMTP_SERVER=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=user@example.com
SMTP_PASSWORD=password
CONTACT_RECIPIENT=contact@example.com
CONTACT_FROM=noreply@example.com
```

## Usage

```rust
use contact_form_handler::{ContactForm, EmailConfig, handle_contact_form};

let form = ContactForm {
    name: "John Doe".into(),
    email: "john@example.com".into(),
    message: "Hello, this is a test message.".into(),
};

let config = EmailConfig::from_env()?;
handle_contact_form(&form, &config).await?;
```

## Integration

Works with any Rust web framework: Actix-web, Axum, Rocket, etc.
