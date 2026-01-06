use crate::errors::ContactFormError;
use crate::models::ContactForm;
use lettre::{
    message::header::ContentType,
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};

#[derive(Debug, Clone)]
pub struct EmailConfig {
    pub smtp_server: String,
    pub smtp_port: u16,
    pub smtp_username: String,
    pub smtp_password: String,
    pub recipient_email: String,
    pub from_email: String,
}

impl EmailConfig {
    pub fn from_env() -> Result<Self, ContactFormError> {
        Ok(Self {
            smtp_server: std::env::var("SMTP_SERVER")
                .map_err(|_| ContactFormError::ConfigError("SMTP_SERVER not set".into()))?,
            smtp_port: std::env::var("SMTP_PORT")
                .unwrap_or_else(|_| "587".into())
                .parse()
                .map_err(|_| ContactFormError::ConfigError("Invalid SMTP_PORT".into()))?,
            smtp_username: std::env::var("SMTP_USERNAME")
                .map_err(|_| ContactFormError::ConfigError("SMTP_USERNAME not set".into()))?,
            smtp_password: std::env::var("SMTP_PASSWORD")
                .map_err(|_| ContactFormError::ConfigError("SMTP_PASSWORD not set".into()))?,
            recipient_email: std::env::var("CONTACT_RECIPIENT")
                .map_err(|_| ContactFormError::ConfigError("CONTACT_RECIPIENT not set".into()))?,
            from_email: std::env::var("CONTACT_FROM")
                .map_err(|_| ContactFormError::ConfigError("CONTACT_FROM not set".into()))?,
        })
    }
}

pub struct EmailSender {
    config: EmailConfig,
}

impl EmailSender {
    pub fn new(config: &EmailConfig) -> Self {
        EmailSender {
            config: config.clone(),
        }
    }

    pub async fn send_email(&self, form: &ContactForm) -> Result<(), ContactFormError> {
        let email = Message::builder()
            .from(
                self.config
                    .from_email
                    .parse()
                    .map_err(|e| ContactFormError::EmailError(format!("Invalid 'from' address: {}", e)))?,
            )
            .reply_to(
                form.email
                    .parse()
                    .map_err(|e| ContactFormError::EmailError(format!("Invalid reply-to: {}", e)))?,
            )
            .to(
                self.config
                    .recipient_email
                    .parse()
                    .map_err(|e| ContactFormError::EmailError(format!("Invalid recipient: {}", e)))?,
            )
            .subject(format!("Contact Form: {}", form.name))
            .header(ContentType::TEXT_PLAIN)
            .body(format!(
                "Name: {}\nEmail: {}\n\nMessage:\n{}",
                form.name, form.email, form.message
            ))
            .map_err(|e| ContactFormError::EmailError(format!("Failed to build email: {}", e)))?;

        let creds = Credentials::new(
            self.config.smtp_username.clone(),
            self.config.smtp_password.clone(),
        );

        let mailer: AsyncSmtpTransport<Tokio1Executor> =
            AsyncSmtpTransport::<Tokio1Executor>::relay(&self.config.smtp_server)
                .map_err(|e| ContactFormError::EmailError(format!("SMTP relay error: {}", e)))?
                .credentials(creds)
                .port(self.config.smtp_port)
                .build();

        mailer
            .send(email)
            .await
            .map_err(|e| ContactFormError::EmailError(format!("Send failed: {}", e)))?;

        Ok(())
    }
}
