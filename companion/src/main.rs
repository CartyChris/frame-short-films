use frame_companion::{default_origins, router, AppState};
use std::collections::HashSet;
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let origins: HashSet<String> = match std::env::var("FRAME_ALLOWED_ORIGINS") {
        Ok(value) => value
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .collect(),
        Err(_) => default_origins(),
    };
    if origins.is_empty()
        || origins
            .iter()
            .any(|s| s.contains('*') || s.contains('\n') || s.contains('\r'))
    {
        return Err("FRAME_ALLOWED_ORIGINS must contain exact, comma-separated origins; wildcards are not accepted".into());
    }
    let token = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:4319").await?;
    println!("Frame companion is listening at http://127.0.0.1:4319\nPaste this token into Frame → Connections → Local companion:\n{token}\nToken is valid only until this companion stops. Keep this terminal open.\nNo account credentials are read or exported by the companion.");
    axum::serve(listener, router(AppState::new(token, origins)))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
