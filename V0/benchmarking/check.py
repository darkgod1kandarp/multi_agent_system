import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
import os

# Load environment variables from the .env file
load_dotenv("crawler/.env")

# # print(os.getenv("AWS_BEARER_TOKEN_BEDROCK"))  # Print the Bedrock API key to verify it's loaded correctly

# # Create a Bedrock Runtime client in the AWS Region you want to use.
# client = boto3.client("bedrock-runtime", region_name="us-east-1")

# # Set the model ID, e.g., Claude 3 Haiku.
# model_id = "us.anthropic.claude-sonnet-4-5-20250929-v1:0 arn:aws:bedrock:us-east-1:968396880463:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0"

# # Start a conversation with the user message.
# user_message = "Describe the purpose of a 'hello world' program in one line."
# conversation = [
#     {
#         "role": "user",
#         "content": [{"text": user_message}],
#     }
# ]

# try:
#     # Send the message to the model, using a basic inference configuration.
#     response = client.converse(
#         modelId=model_id,
#         messages=conversation,
#         inferenceConfig={"maxTokens": 512, "temperature": 0.5, "topP": 0.9}, 
#     )

#     # Extract and print the response text.
#     response_text = response["output"]["message"]["content"][0]["text"]
#     print(response_text)

# except (ClientError, Exception) as e:
#     print(f"ERROR: Can't invoke '{model_id}'. Reason: {e}")
#     exit(1)


import boto3

runtime = boto3.client("bedrock-runtime", region_name="us-east-1")

model_id = "us.anthropic.claude-sonnet-4-20250514-v1:0"  # example profile ID
# OR model_id = "arn:aws:bedrock:us-east-1:123456789012:inference-profile/..."

resp = runtime.converse(
    modelId=model_id,
    messages=[{"role": "user", "content": [{"text": "Okay now we are testing you"}]}],
)
print(resp["output"]["message"]["content"][0]["text"])



# # import boto3

# # bedrock = boto3.client("bedrock", region_name="us-east-1")

# # resp = bedrock.list_inference_profiles(typeEquals="SYSTEM_DEFINED")
# # for p in resp["inferenceProfileSummaries"]:
# #     print(p["inferenceProfileId"], p["inferenceProfileArn"])


import boto3

bedrock = boto3.client("bedrock", region_name="us-east-1")

resp = bedrock.list_inference_profiles(typeEquals="SYSTEM_DEFINED")
for p in resp["inferenceProfileSummaries"]:
    print(p["inferenceProfileId"], p["inferenceProfileArn"])

bedrock = boto3.client("bedrock", region_name="us-east-1")

resp = bedrock.list_foundation_models()
for m in resp["modelSummaries"]:
    print(m["modelId"], m.get("modelName"), m.get("providerName"))
    
    


