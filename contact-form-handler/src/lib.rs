mod email;
mod errors;
mod models;
mod validator;

pub use email::{EmailConfig, EmailSender};
pub use errors::ContactFormError;
pub use models::ContactForm;
pub use validator::validate_form;

/// Handles the contact form submission process: validates the form and sends an email.
/// This function is framework-agnostic and can be called from any web framework.
pub async fn handle_contact_form(
    form: &ContactForm,
    email_config: &EmailConfig,
) -> Result<(), ContactFormError> {
    validate_form(form)?;
    let email_sender = EmailSender::new(email_config);
    email_sender.send_email(form).await?;
    Ok(())
}
