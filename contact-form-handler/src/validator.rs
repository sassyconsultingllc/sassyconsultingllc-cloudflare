use crate::errors::ContactFormError;
use crate::models::ContactForm;
use validator::Validate;

pub fn validate_form(form: &ContactForm) -> Result<(), ContactFormError> {
    form.validate()
        .map_err(|e| ContactFormError::ValidationError(e.to_string()))
}
