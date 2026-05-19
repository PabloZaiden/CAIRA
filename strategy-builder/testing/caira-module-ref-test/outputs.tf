output "sample_model_name" {
  description = "Sample model from the common_models module reference test."
  value       = module.common_models.gpt_5_2_chat.name
}
