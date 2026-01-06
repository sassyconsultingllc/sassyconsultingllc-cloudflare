use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContactFormError {
    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("Email error: {0}")]
    EmailError(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),
}
