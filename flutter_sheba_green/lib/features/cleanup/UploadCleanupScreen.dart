import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class UploadCleanupScreen extends StatefulWidget {
  const UploadCleanupScreen({super.key});

  @override
  State<UploadCleanupScreen> createState() => _UploadCleanupScreenState();
}

class _UploadCleanupScreenState extends State<UploadCleanupScreen> {
  final _descController = TextEditingController();
  bool _isUploading = false;

  @override
  void dispose() {
    _descController.dispose();
    super.dispose();
  }

  void _submitPost() async {
    setState(() => _isUploading = true);

    // simulate network delay
    await Future.delayed(const Duration(seconds: 2));

    setState(() => _isUploading = false);

    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text("Cleanup uploaded successfully ✅")),
    );

    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Upload Cleanup"),
        backgroundColor: ShebaColors.lightGreen,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Upload Media
            Card(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              child: InkWell(
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text("Media picker coming soon 📸"),
                    ),
                  );
                },
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  height: 180,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    color: ShebaColors.paleGreen.withOpacity(0.3),
                  ),
                  child: const Center(
                    child: Icon(
                      Icons.cloud_upload,
                      size: 64,
                      color: ShebaColors.darkGreen,
                    ),
                  ),
                ),
              ),
            ),

            const SizedBox(height: 20),

            // Description Field
            Text("Description", style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            TextField(
              controller: _descController,
              maxLines: 4,
              decoration: InputDecoration(
                hintText: "Write about your cleanup...",
                filled: true,
                fillColor: ShebaColors.paleGreen.withOpacity(0.15),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),

            const SizedBox(height: 20),

            // Location Preview
            Row(
              children: const [
                Icon(Icons.location_on, color: ShebaColors.darkGreen),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    "Addis Ababa, Ethiopia",
                    style: TextStyle(color: ShebaColors.grey700),
                  ),
                ),
                Icon(Icons.edit_location_alt, color: ShebaColors.grey700),
              ],
            ),

            const SizedBox(height: 32),

            // Submit Button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _isUploading ? null : _submitPost,
                icon: _isUploading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.check_circle),
                label: Text(_isUploading ? "Uploading..." : "Submit"),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  backgroundColor: ShebaColors.darkGreen,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
